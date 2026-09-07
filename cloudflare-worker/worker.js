// ================================================
// cloudflare-worker/worker.js — 邻里好物 薄代理（ADR-0001）
// 持有 GitHub Token（env secret），浏览器只调 /api/*，Token 永不进客户端。
// 鉴权：ADR-0005 手机号+PIN 登录 → JWT（7天）→ 写操作带 Authorization header。
// 护栏：Origin 白名单、item 标签、字段白名单、图片 URL 白名单、分路由限流。
// ================================================

import {
  BODY_MAX,
  CONTACT_MAX,
  DESC_MAX,
  IMG_DATA_MAX,
  NAME_MAX,
  authFromRequest,
  clampLatLng,
  generateSalt,
  hasItemLabel,
  hashPhone,
  hashPin,
  isAllowedOrigin,
  isWeakPin,
  isValidPhone,
  maskPhone,
  normalizeCategory,
  requirePhone,
  safeImgUrl,
  sanitizeText,
  signJwt,
  toPublicItem,
  verifyPin,
} from './security.js'
import { checkImageDataUrl, moderateText } from './moderation.js'
import { createAuditor } from './imageAudit.js'

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
    'Access-Control-Allow-Headers': 'Content-Type, x-site-key, Authorization',
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
    // ADR-0005: 身份哈希字段
    ownerHash: typeof d.ownerHash === 'string' && d.ownerHash ? d.ownerHash : '',
    borrowerHash: typeof d.borrowerHash === 'string' && d.borrowerHash ? d.borrowerHash : '',
    borrowedAt: typeof d.borrowedAt === 'string' ? d.borrowedAt : undefined,
    lat: typeof d.lat === 'number' && Number.isFinite(d.lat) ? d.lat : null,
    lng: typeof d.lng === 'number' && Number.isFinite(d.lng) ? d.lng : null,
    category: typeof d.category === 'string' ? d.category : 'other',
    createTime: typeof d.createTime === 'string' ? d.createTime : issue.created_at || new Date().toISOString(),
    archived: issue.state === 'closed',
    rentType: d.rentType === 'daily' || d.rentType === 'perUse' ? d.rentType : 'free',
    rentFee: typeof d.rentFee === 'number' && Number.isFinite(d.rentFee) && d.rentFee >= 0 ? d.rentFee : 0,
    rentRecords: Array.isArray(d.rentRecords) ? d.rentRecords : undefined,
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

// ─── 规模化优化：分页拉取 / 5s 缓存 + single-flight / 写限流退避重试 ───
// 与 server/proxy-server.mjs 同实现：per_page=100 硬上限 → 分页拉取（最多 500 件）；
// 并发读雷群 → 5s 缓存 + single-flight 合并；GitHub 二级限流 → 写操作退避重试 2 次。
async function listAllIssues() {
  const out = []
  for (let page = 1; page <= 5; page++) {
    const r = await gh(`?state=all&labels=item&per_page=100&sort=updated&direction=desc&page=${page}`)
    if (!r.ok) return { error: true }
    const arr = await r.json()
    out.push(...arr)
    if (arr.length < 100) break
  }
  return { issues: out }
}

const LIST_TTL = 5000
let listCache = { at: 0, data: null }
let listInflight = null
function invalidateList() {
  listCache.at = 0
}

async function getList() {
  if (listCache.data && Date.now() - listCache.at < LIST_TTL) return listCache.data
  if (!listInflight) {
    listInflight = (async () => {
      try {
        const { issues, error } = await listAllIssues()
        if (error) throw new Error('list-fail')
        listCache = { at: Date.now(), data: issues.map((issue) => toPublicItem(toItem(issue))) }
        return listCache.data
      } finally {
        listInflight = null
      }
    })()
  }
  return listInflight
}

async function ghWrite(path, method, body) {
  for (let i = 0; ; i++) {
    const r = await gh(path, method, body)
    if ((r.status === 403 || r.status === 429) && i < 2) {
      const e = await r.text().catch(() => '')
      if (/rate limit/i.test(e)) {
        await new Promise((r2) => setTimeout(r2, 1000 * (i + 1)))
        continue
      }
    }
    return r
  }
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

/**
 * 判断是否物主（ADR-0005：phoneHash 比对）
 * @param {object} data - Issue 数据块
 * @param {string} phoneHash - 当前用户的 phoneHash
 */
function isOwner(data, phoneHash) {
  return !!phoneHash && !!data.ownerHash && data.ownerHash === phoneHash
}

/**
 * 判断是否借阅人（ADR-0005：phoneHash 比对）
 */
function isBorrower(data, phoneHash) {
  return !!phoneHash && !!data.borrowerHash && data.borrowerHash === phoneHash
}

function isLentIssue(issue, data) {
  return (issue.labels || []).some((l) => l.name === 'lent') || !!data.borrowerHash
}

async function handle(request, env) {
  GH_TOKEN = env.GITHUB_TOKEN || ''
  const auditor = createAuditor(env.AUDIT_MODE || 'nsfwjs', {
    nsfwUrl: env.NSFWJS_URL || '',
  })
  const expectedSiteKey = env.SITE_KEY || SITE_KEY_DEFAULT
  const origin = request.headers.get('origin') || ''

  // ADR-0005: 账号体系环境变量
  const HASH_PEPPER = env.HASH_PEPPER || ''
  const JWT_SECRET = env.JWT_SECRET || ''
  const ADMIN_TOKEN = env.ADMIN_TOKEN || ''
  const USERS_KV = env.USERS_KV || null // Cloudflare KV 命名空间，存储 phoneHash → {pinHash, salt, createdAt}

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
  if (!rateOk(request, isWrite ? 40 : 120, 10 * 60 * 1000)) {
    return json(429, { error: '请求过于频繁，请稍后再试' }, origin)
  }

  let m

  try {
    // ─── ADR-0005: 注册 ───
    if (request.method === 'POST' && p === '/api/register') {
      if (!USERS_KV || !HASH_PEPPER || !JWT_SECRET) {
        return json(500, { error: '账号服务未配置，请联系站长' }, origin)
      }
      if (!rateOk(request, 5, 60 * 60 * 1000)) {
        return json(429, { error: '注册过于频繁，请一小时后再试' }, origin)
      }
      const parsed = await readJson(request)
      if (parsed.tooLarge || parsed.bad || !parsed.body) return json(400, { error: '请求内容无法解析' }, origin)
      const phone = String(parsed.body.phone || '').trim()
      const pin = String(parsed.body.pin || '').trim()
      if (!isValidPhone(phone)) return json(400, { error: '手机号格式不正确' }, origin)
      if (!/^\d{6}$/.test(pin)) return json(400, { error: '管理口令需为 6 位数字' }, origin)
      if (isWeakPin(pin)) return json(400, { error: '管理口令过于简单（如 123456、连续数字），请换一个' }, origin)

      const pHash = await hashPhone(phone, HASH_PEPPER)
      // 检查是否已注册
      const existing = await USERS_KV.get(pHash)
      if (existing) return json(409, { error: '该手机号已注册，请直接登录' }, origin)

      const salt = generateSalt()
      const pinH = await hashPin(pin, salt)
      await USERS_KV.put(pHash, JSON.stringify({ pinHash: pinH, salt, createdAt: new Date().toISOString() }))

      const token = await signJwt({ phoneHash: pHash }, JWT_SECRET)
      return json(200, { ok: true, token, phone: maskPhone(phone) }, origin)
    }

    // ─── ADR-0005: 登录 ───
    if (request.method === 'POST' && p === '/api/login') {
      if (!USERS_KV || !HASH_PEPPER || !JWT_SECRET) {
        return json(500, { error: '账号服务未配置，请联系站长' }, origin)
      }
      if (!rateOk(request, 10, 60 * 1000)) {
        return json(429, { error: '登录尝试过于频繁，请稍后再试' }, origin)
      }
      const parsed = await readJson(request)
      if (parsed.tooLarge || parsed.bad || !parsed.body) return json(400, { error: '请求内容无法解析' }, origin)
      const phone = String(parsed.body.phone || '').trim()
      const pin = String(parsed.body.pin || '').trim()
      if (!isValidPhone(phone)) return json(400, { error: '手机号或管理口令错误' }, origin)
      if (!/^\d{6}$/.test(pin)) return json(400, { error: '手机号或管理口令错误' }, origin)

      const pHash = await hashPhone(phone, HASH_PEPPER)
      const userStr = await USERS_KV.get(pHash)
      if (!userStr) return json(401, { error: '手机号或管理口令错误' }, origin)
      let user
      try {
        user = JSON.parse(userStr)
      } catch {
        return json(500, { error: '账号数据异常，请联系站长' }, origin)
      }
      const pinOk = await verifyPin(pin, user.pinHash, user.salt)
      if (!pinOk) return json(401, { error: '手机号或管理口令错误' }, origin)

      const token = await signJwt({ phoneHash: pHash }, JWT_SECRET)
      return json(200, { ok: true, token, phone: maskPhone(phone) }, origin)
    }

    // ─── ADR-0005: 管理员重置口令 ───
    if (request.method === 'POST' && p === '/api/admin/reset-pin') {
      if (!ADMIN_TOKEN) return json(404, { error: '未找到接口' }, origin) // 隐藏管理员接口
      if (request.headers.get('x-admin-token') !== ADMIN_TOKEN) {
        return json(403, { error: '管理员令牌错误' }, origin)
      }
      if (!USERS_KV || !HASH_PEPPER) return json(500, { error: '账号服务未配置' }, origin)
      const parsed = await readJson(request)
      if (parsed.tooLarge || parsed.bad || !parsed.body) return json(400, { error: '请求内容无法解析' }, origin)
      const phone = String(parsed.body.phone || '').trim()
      const newPin = String(parsed.body.newPin || '').trim()
      if (!isValidPhone(phone)) return json(400, { error: '手机号格式不正确' }, origin)
      const pinToSet = newPin && /^\d{6}$/.test(newPin) ? newPin : String(Math.floor(100000 + Math.random() * 900000))
      const pHash = await hashPhone(phone, HASH_PEPPER)
      const userStr = await USERS_KV.get(pHash)
      if (!userStr) return json(404, { error: '该手机号未注册' }, origin)
      let user
      try {
        user = JSON.parse(userStr)
      } catch {
        return json(500, { error: '账号数据异常' }, origin)
      }
      const salt = generateSalt()
      user.pinHash = await hashPin(pinToSet, salt)
      user.salt = salt
      user.resetAt = new Date().toISOString()
      await USERS_KV.put(pHash, JSON.stringify(user))
      return json(200, { ok: true, phone: maskPhone(phone), temporaryPin: pinToSet }, origin)
    }

    if (request.method === 'GET' && p === '/api/items') {
      try {
        return json(200, await getList(), origin)
      } catch {
        return json(502, { error: '读取失败，请稍后再试' }, origin)
      }
    }

    if (request.method !== 'POST') return json(405, { error: '仅支持 GET/POST' }, origin)

    // ─── 发布（ADR-0005：JWT 鉴权 + ownerHash） ───
    if (p === '/api/items') {
      if (!rateOk(request, 12, 60 * 60 * 1000)) {
        return json(429, { error: '发布过于频繁，请一小时后再试' }, origin)
      }
      // ADR-0005: JWT 鉴权
      const authPayload = await authFromRequest(request, JWT_SECRET)
      const phoneHash = authPayload?.phoneHash || ''
      if (!phoneHash) return json(401, { error: '请先登录' }, origin)

      const parsed = await readJson(request)
      if (parsed.tooLarge) return json(413, { error: '内容过大，请压缩图片后重试' }, origin)
      if (parsed.bad || !parsed.body) return json(400, { error: '请求内容无法解析，请重试' }, origin)
      const b = parsed.body
      const name = sanitizeText(b.name, NAME_MAX)
      const desc = sanitizeText(b.desc, DESC_MAX)
      if (!name) return json(400, { error: '缺少物品名称' }, origin)
      if (!desc) return json(400, { error: '缺少物品描述' }, origin)
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
      // ─── 内容安全审核（发布强拦截）───
      const mod = moderateText(`${name} ${desc} ${contact}`)
      if (!mod.pass) {
        return json(400, { error: mod.reason }, origin)
      }
      if (imgUrl.startsWith('data:')) {
        const imgCheck = checkImageDataUrl(imgUrl)
        if (!imgCheck.ok) {
          return json(400, { error: imgCheck.reason }, origin)
        }
        // ─── 图片画面审核（可插拔 Provider：nsfwjs 本地服务等）───
        const audit = await auditor.audit(imgUrl)
        if (audit.error) {
          return json(502, { error: '图片审核服务暂不可用，请稍后再试' }, origin)
        }
        if (!audit.pass) {
          return json(400, { error: audit.reason || '图片内容违规，禁止发布' }, origin)
        }
      }
      // ─── 租金字段（免费 / 按天 / 按次）───
      const rentType = b.rentType === 'daily' || b.rentType === 'perUse' ? b.rentType : 'free'
      const rentFee = rentType === 'free' ? 0 : Number(b.rentFee)
      if (rentType !== 'free' && (!Number.isFinite(rentFee) || rentFee <= 0 || rentFee > 100000)) {
        return json(400, { error: '请填写正确的租金金额（大于 0）' }, origin)
      }
      const { lat, lng } = clampLatLng(b.lat, b.lng)
      const data = {
        name,
        desc,
        contactType,
        contact,
        imgUrl,
        category: normalizeCategory(b.category),
        ownerHash: phoneHash,
        lat,
        lng,
        rentType,
        rentFee,
        createTime: new Date().toISOString(),
      }
      const body = withDataBlock('', data)
      const res = await ghWrite('', 'POST', { title: `[闲置物品] ${data.name}`, body, labels: ['item'] })
      if (!res.ok) {
        return json(res.status === 422 ? 413 : 502, {
          error: res.status === 422 ? '内容过长，请压缩图片、精简描述后重试' : '发布失败，请稍后再试',
        }, origin)
      }
      const created = await res.json()
      invalidateList()
      return json(200, { ok: true, id: created.number }, origin)
    }

    // ─── 借用（ADR-0005：JWT 鉴权 + borrowerHash） ───
    if ((m = p.match(/^\/api\/items\/(\d+)\/borrow$/))) {
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      // ADR-0005: JWT 鉴权
      const authPayload = await authFromRequest(request, JWT_SECRET)
      const phoneHash = authPayload?.phoneHash || ''
      if (!phoneHash) return json(401, { error: '请先登录' }, origin)
      if (issue.state !== 'open') return json(409, { error: '该物品已下架' }, origin)
      const data = extractData(issue.body)
      if (isLentIssue(issue, data)) return json(409, { error: '该物品当前不可借用' }, origin)
      if (isOwner(data, phoneHash)) return json(409, { error: '不能借用自己发布的物品' }, origin)
      data.borrowerHash = phoneHash
      data.borrowedAt = new Date().toISOString()
      delete data.receiptHmac
      delete data.pinHmac
      const patch = await ghWrite(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
      if (!patch.ok) return json(502, { error: '借用失败，请稍后再试' }, origin)
      await ghWrite(`/${issue.number}/labels`, 'POST', { labels: ['lent'] })
      invalidateList()
      return json(200, { ok: true }, origin)
    }

    // ─── 归还（ADR-0005：JWT 鉴权） ───
    if ((m = p.match(/^\/api\/items\/(\d+)\/return$/))) {
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      // ADR-0005: JWT 鉴权
      const authPayload = await authFromRequest(request, JWT_SECRET)
      const phoneHash = authPayload?.phoneHash || ''
      if (!phoneHash) return json(401, { error: '请先登录' }, origin)
      const data = extractData(issue.body)
      if (!isLentIssue(issue, data)) return json(409, { error: '该物品当前未借出' }, origin)
      if (!isBorrower(data, phoneHash)) return json(403, { error: '只有借阅人可以归还' }, origin)
      // ─── 租金结算：记录归还时间，按天/按次写入历史结算记录（免费不计）───
      if (data.borrowedAt) {
        const returnedAt = new Date().toISOString()
        const rentType = data.rentType === 'daily' || data.rentType === 'perUse' ? data.rentType : 'free'
        if (rentType !== 'free') {
          const start = Date.parse(data.borrowedAt)
          const end = Date.parse(returnedAt)
          const fee = Number(data.rentFee)
          let amount = 0
          let days
          if (rentType === 'daily' && Number.isFinite(start) && Number.isFinite(end)) {
            days = Math.max(1, Math.ceil(Math.max(end - start, 0) / 86400000))
            amount = (Number.isFinite(fee) ? fee : 0) * days
          } else if (rentType === 'perUse') {
            amount = Number.isFinite(fee) ? fee : 0
          }
          const records = Array.isArray(data.rentRecords) ? data.rentRecords : []
          records.push({
            borrowedAt: data.borrowedAt,
            returnedAt,
            days,
            fee: amount,
            borrowerHash: data.borrowerHash,
          })
          data.rentRecords = records
        }
      }
      delete data.borrowedAt
      delete data.borrowerHash
      delete data.receiptHmac
      const patch = await ghWrite(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
      if (!patch.ok) return json(502, { error: '归还失败，请稍后再试' }, origin)
      await ghWrite(`/${issue.number}/labels/lent`, 'DELETE')
      invalidateList()
      return json(200, { ok: true }, origin)
    }

    // ─── 下架 / 上架（ADR-0005：JWT 鉴权；已借出也可下架，不影响进行中的借用）───
    if ((m = p.match(/^\/api\/items\/(\d+)\/(archive|unarchive)$/))) {
      const wantClosed = m[2] === 'archive'
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      // ADR-0005: JWT 鉴权
      const authPayload = await authFromRequest(request, JWT_SECRET)
      const phoneHash = authPayload?.phoneHash || ''
      if (!phoneHash) return json(401, { error: '请先登录' }, origin)
      const data = extractData(issue.body)
      if (!isOwner(data, phoneHash)) return json(403, { error: '只有发布者可以管理这件物品' }, origin)
      const patch = await ghWrite(`/${issue.number}`, 'PATCH', { state: wantClosed ? 'closed' : 'open' })
      if (!patch.ok) return json(502, { error: '操作失败，请稍后再试' }, origin)
      invalidateList()
      return json(200, { ok: true }, origin)
    }

    // ─── 删除（ADR-0005：JWT 鉴权；已借出不可删）───
    if ((m = p.match(/^\/api\/items\/(\d+)\/delete$/))) {
      const { issue, missing, error } = await readIssue(+m[1])
      if (missing) return json(404, { error: '物品不存在' }, origin)
      if (error) return json(502, { error: '服务暂时不可用，请稍后再试' }, origin)
      // ADR-0005: JWT 鉴权
      const authPayload = await authFromRequest(request, JWT_SECRET)
      const phoneHash = authPayload?.phoneHash || ''
      if (!phoneHash) return json(401, { error: '请先登录' }, origin)
      const data = extractData(issue.body)
      if (!isOwner(data, phoneHash)) return json(403, { error: '只有发布者可以删除这件物品' }, origin)
      if (isLentIssue(issue, data)) return json(409, { error: '物品借出中，请先收回再删除' }, origin)
      await ghWrite(`/${issue.number}/labels/item`, 'DELETE')
      await ghWrite(`/${issue.number}`, 'PATCH', { state: 'closed' })
      invalidateList()
      return json(200, { ok: true }, origin)
    }

    return json(404, { error: '未找到接口' }, origin)
  } catch {
    return json(500, { error: '服务暂时不可用，请稍后再试' }, origin)
  }
}

export { handle }
export default { fetch: handle }
