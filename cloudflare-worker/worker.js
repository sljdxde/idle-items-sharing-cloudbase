// ================================================
// cloudflare-worker/worker.js — 邻里好物 薄代理（ADR-0001）
// 持有 GitHub Token（env secret），浏览器只调 /api/*，Token 永不进客户端。
// 鉴权：登录手机号作为写凭证（operatorPhone ↔ ownerPhone / borrowedBy）。
// 护栏：Origin 白名单、item 标签、字段白名单、图片 URL 白名单、分路由限流。
// ================================================

import {
  BODY_MAX,
  CONTACT_MAX,
  DESC_MAX,
  IMG_DATA_MAX,
  NAME_MAX,
  clampLatLng,
  hasItemLabel,
  isAllowedOrigin,
  isValidPhone,
  normalizeCategory,
  requirePhone,
  safeImgUrl,
  sanitizeText,
  toPublicItem,
} from './security.js'

let GH_TOKEN = ''
const OWNER = 'sljdxde'
const REPO = 'idle-items-sharing-cloudbase'
const SITE_KEY_DEFAULT = 'neighborhood-share-2026'
const API = `https://api.github.com/repos/${OWNER}/${REPO}/issues`
const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/

function corsHeaders(origin) {
  const allow = origin && isAllowedOrigin(origin) ? origin : 'null'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-site-key',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    Vary: 'Origin',
  }
}

function json(status, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  })
}

function preflight(origin) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

// 简易限流（内存，冷启动会重置）
const hits = new Map()
function rateOk(request, limit, windowMs) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'anon'
  const key = `${ip}|${limit}|${windowMs}`
  const now = Date.now()
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) {
    hits.set(key, arr)
    return false
  }
  arr.push(now)
  hits.set(key, arr)
  return true
}

async function gh(path, method = 'GET', body) {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'neighborhood-proxy',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function extractData(body) {
  const m = body ? body.match(DATA_RE) : null
  if (!m || !m[1]) return {}
  try {
    const parsed = JSON.parse(m[1].trim())
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function toItem(issue) {
  const d = extractData(issue.body)
  const isLent = (issue.labels || []).some((l) => l.name === 'lent')
  return {
    id: issue.number,
    name:
      typeof d.name === 'string' && d.name.trim()
        ? d.name
        : String(issue.title || '')
            .replace(/^\[闲置物品\]\s*/, '')
            .trim() || '未命名物品',
    desc: typeof d.desc === 'string' ? d.desc : '',
    contactType: d.contactType === 'building' ? 'building' : 'phone',
    contact: typeof d.contact === 'string' ? d.contact : '',
    imgUrl: typeof d.imgUrl === 'string' ? d.imgUrl : '',
    status: isLent ? 'lent' : 'available',
    ownerPhone: requirePhone(d.ownerPhone),
    borrowedBy: requirePhone(d.borrowedBy),
    borrowedAt: typeof d.borrowedAt === 'string' ? d.borrowedAt : undefined,
    lat: typeof d.lat === 'number' && Number.isFinite(d.lat) ? d.lat : null,
    lng: typeof d.lng === 'number' && Number.isFinite(d.lng) ? d.lng : null,
    category: typeof d.category === 'string' ? d.category : 'other',
    createTime: typeof d.createTime === 'string' ? d.createTime : issue.created_at || new Date().toISOString(),
    archived: issue.state === 'closed',
  }
}

function withDataBlock(_oldBody, data) {
  const publicDesc = sanitizeText(data.desc, DESC_MAX)
  const block = `<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->`
  return `${publicDesc}\n\n${block}\n\n— 以下为自动生成的数据块，请勿删除 —`
}

async function readIssue(num) {
  if (!Number.isInteger(num) || num < 1 || num > 1_000_000) return { missing: true }
  const res = await gh(`/${num}`)
  if (res.status === 404) return { missing: true }
  if (!res.ok) return { error: true }
  const issue = await res.json()
  if (!hasItemLabel(issue)) return { missing: true }
  return { issue }
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0)
  if (len > BODY_MAX) return { tooLarge: true }
  const text = await request.text()
  if (text.length > BODY_MAX) return { tooLarge: true }
  if (!text) return { body: {} }
  try {
    const body = JSON.parse(text)
    return body && typeof body === 'object' ? { body } : { bad: true }
  } catch {
    return { bad: true }
  }
}

function isOwner(data, phone) {
  return !!phone && requirePhone(data.ownerPhone) === phone
}

function isBorrower(data, phone) {
  return !!phone && requirePhone(data.borrowedBy) === phone
}

function isLentIssue(issue, data) {
  return (issue.labels || []).some((l) => l.name === 'lent') || !!data.borrowedBy
}

async function handle(request, env) {
  GH_TOKEN = env.GITHUB_TOKEN || ''
  const expectedSiteKey = env.SITE_KEY || SITE_KEY_DEFAULT
  const origin = request.headers.get('origin') || ''

  if (request.method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin)) return json(403, { error: '来源不被允许' }, origin)
    return preflight(origin)
  }
  if (origin && !isAllowedOrigin(origin)) return json(403, { error: '来源不被允许' }, origin)
  if (!GH_TOKEN) return json(500, { error: '服务配置错误，请联系站长' }, origin)
  if (request.headers.get('x-site-key') !== expectedSiteKey) return json(403, { error: '站点密钥错误' }, origin)

  const url = new URL(request.url)
  const p = url.pathname
  const isWrite = request.method === 'POST'
  if (!rateOk(request, isWrite ? 20 : 60, 10 * 60 * 1000)) {
    return json(429, { error: '请求过于频繁，请稍后再试' }, origin)
  }

  let m

  try {
    if (request.method === 'GET' && p === '/api/items') {
      const res = await gh('?state=all&labels=item&per_page=100&sort=updated&direction=desc')
      if (!res.ok) return json(502, { error: '读取失败，请稍后再试' }, origin)
      const issues = await res.json()
      return json(200, issues.map((issue) => toPublicItem(toItem(issue))), origin)
    }

    if (request.method !== 'POST') return json(405, { error: '仅支持 GET/POST' }, origin)

    // ─── 发布 ───
    if (p === '/api/items') {
      if (!rateOk(request, 8, 60 * 60 * 1000)) {
        return json(429, { error: '发布过于频繁，请一小时后再试' }, origin)
      }
      const parsed = await readJson(request)
      if (parsed.tooLarge) return json(413, { error: '内容过大，请压缩图片后重试' }, origin)
      if (parsed.bad || !parsed.body) return json(400, { error: '请求内容无法解析，请重试' }, origin)
      const b = parsed.body
      const name = sanitizeText(b.name, NAME_MAX)
      const desc = sanitizeText(b.desc, DESC_MAX)
      const ownerPhone = String(b.ownerPhone || '').trim()
      if (!name) return json(400, { error: '缺少物品名称' }, origin)
      if (!desc) return json(400, { error: '缺少物品描述' }, origin)
      if (!isValidPhone(ownerPhone)) return json(400, { error: '发布者手机号格式不正确' }, origin)
      const contactType = b.contactType === 'building' ? 'building' : 'phone'
      const contact = sanitizeText(b.contact, CONTACT_MAX)
      if (!contact) return json(400, { error: '缺少联系方式' }, origin)
      if (contactType === 'phone' && !isValidPhone(contact)) {
        return json(400, { error: '联系手机号格式不正确' }, origin)
      }
      const imgUrl = safeImgUrl(b.imgUrl)
      if (String(b.imgUrl || '').trim() && !imgUrl) {
        return json(400, { error: '图片格式不支持，请换一张 jpeg/png/webp' }, origin)
      }
      if (imgUrl.length > IMG_DATA_MAX) {
        return json(413, { error: '图片过大，请压缩后重试' }, origin)
      }
      const { lat, lng } = clampLatLng(b.lat, b.lng)
      const data = {
        name,
        desc,
        contactType,
        contact,
        imgUrl,
        category: normalizeCategory(b.category),
        ownerPhone,
        lat,
        lng,
        createTime: new Date().toISOString(),
      }
      const body = withDataBlock('', data)
      const res = await gh('', 'POST', { title: `[闲置物品] ${data.name}`, body, labels: ['item'] })
      if (!res.ok) {
        return json(res.status === 422 ? 413 : 502, {
          error: res.status === 422 ? '内容过长，请压缩图片、精简描述后重试' : '发布失败，请稍后再试',
        }, origin)
      }
      const created = await res.json()
      return json(200, { ok: true, id: created.number }, origin)
    }

    // ─── 借用 ───
    if ((m = p.match(/^\/api\/items\/(\d+)\/borrow$/))) {
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      const parsed = await readJson(request)
      if (parsed.tooLarge || parsed.bad) return json(400, { error: '请求内容无法解析，请重试' }, origin)
      const phone = requirePhone(parsed.body?.operatorPhone)
      if (!phone) return json(400, { error: '手机号格式不正确' }, origin)
      if (issue.state !== 'open') return json(409, { error: '该物品已下架' }, origin)
      const data = extractData(issue.body)
      if (isLentIssue(issue, data)) return json(409, { error: '该物品当前不可借用' }, origin)
      if (isOwner(data, phone)) return json(409, { error: '不能借用自己发布的物品' }, origin)
      data.borrowedBy = phone
      data.borrowedAt = new Date().toISOString()
      delete data.receiptHmac
      delete data.pinHmac
      const patch = await gh(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
      if (!patch.ok) return json(502, { error: '借用失败，请稍后再试' }, origin)
      await gh(`/${issue.number}/labels`, 'POST', { labels: ['lent'] })
      return json(200, { ok: true }, origin)
    }

    // ─── 归还 ───
    if ((m = p.match(/^\/api\/items\/(\d+)\/return$/))) {
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      const parsed = await readJson(request)
      if (parsed.tooLarge || parsed.bad) return json(400, { error: '请求内容无法解析，请重试' }, origin)
      const phone = requirePhone(parsed.body?.operatorPhone)
      if (!phone) return json(400, { error: '手机号格式不正确' }, origin)
      const data = extractData(issue.body)
      if (!isLentIssue(issue, data)) return json(409, { error: '该物品当前未借出' }, origin)
      if (!isBorrower(data, phone)) return json(403, { error: '只有借阅人可以归还' }, origin)
      delete data.borrowedBy
      delete data.borrowedAt
      delete data.receiptHmac
      const patch = await gh(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
      if (!patch.ok) return json(502, { error: '归还失败，请稍后再试' }, origin)
      await gh(`/${issue.number}/labels/lent`, 'DELETE')
      return json(200, { ok: true }, origin)
    }

    // ─── 下架 / 上架（已借出也可下架，不影响进行中的借用）───
    if ((m = p.match(/^\/api\/items\/(\d+)\/(archive|unarchive)$/))) {
      const wantClosed = m[2] === 'archive'
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      const parsed = await readJson(request)
      if (parsed.tooLarge || parsed.bad) return json(400, { error: '请求内容无法解析，请重试' }, origin)
      const phone = requirePhone(parsed.body?.operatorPhone)
      if (!phone) return json(400, { error: '手机号格式不正确' }, origin)
      const data = extractData(issue.body)
      if (!isOwner(data, phone)) return json(403, { error: '只有发布者可以管理这件物品' }, origin)
      const patch = await gh(`/${issue.number}`, 'PATCH', { state: wantClosed ? 'closed' : 'open' })
      if (!patch.ok) return json(502, { error: '操作失败，请稍后再试' }, origin)
      return json(200, { ok: true }, origin)
    }

    // ─── 删除（已借出不可删）───
    if ((m = p.match(/^\/api\/items\/(\d+)\/delete$/))) {
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      const parsed = await readJson(request)
      if (parsed.tooLarge || parsed.bad) return json(400, { error: '请求内容无法解析，请重试' }, origin)
      const phone = requirePhone(parsed.body?.operatorPhone)
      if (!phone) return json(400, { error: '手机号格式不正确' }, origin)
      const data = extractData(issue.body)
      if (!isOwner(data, phone)) return json(403, { error: '只有发布者可以删除这件物品' }, origin)
      if (isLentIssue(issue, data)) return json(409, { error: '物品借出中，请先收回再删除' }, origin)
      await gh(`/${issue.number}/labels/item`, 'DELETE')
      await gh(`/${issue.number}`, 'PATCH', { state: 'closed' })
      return json(200, { ok: true }, origin)
    }

    return json(404, { error: '未找到接口' }, origin)
  } catch {
    return json(500, { error: '服务暂时不可用，请稍后再试' }, origin)
  }
}

export { handle }
export default { fetch: handle }
