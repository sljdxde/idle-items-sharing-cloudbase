// ================================================
// server/proxy-server.mjs — 自建服务器版代理（与 cloudflare-worker/worker.js 同契约）
// Node 原生 http 实现：/api/* 走 GitHub 代理；其余路径服务 ./dist 静态站。
// 监听 127.0.0.1:8087，由 nginx 80 端口转发（无需 root 跑本进程）。
// Token 从环境变量 GITHUB_TOKEN 或同目录 .token 文件读取（chmod 600）。
// ================================================

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BODY_MAX,
  CONTACT_MAX,
  DESC_MAX,
  IMG_DATA_MAX,
  NAME_MAX,
  clampLatLng,
  hasItemLabel,
  isValidPhone,
  normalizeCategory,
  requirePhone,
  safeImgUrl,
  sanitizeText,
  toPublicItem,
} from '../cloudflare-worker/security.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DIST = join(ROOT, 'dist')
const UPLOADS = join(ROOT, 'uploads')
const PORT = Number(process.env.PORT || 8087)
const HOST = '127.0.0.1'
const SITE_KEY = process.env.SITE_KEY || 'neighborhood-share-2026'

const OWNER = 'sljdxde'
const REPO = 'idle-items-sharing-cloudbase'
const API = `https://api.github.com/repos/${OWNER}/${REPO}/issues`
const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/

let GH_TOKEN = process.env.GITHUB_TOKEN || ''
if (!GH_TOKEN) {
  try { GH_TOKEN = (await readFile(join(ROOT, '.token'), 'utf8')).trim() } catch { /* env 兜底 */ }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://nominatim.openstreetmap.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
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
        : String(issue.title || '').replace(/^\[闲置物品\]\s*/, '').trim() || '未命名物品',
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
    createTime: typeof d.createTime === 'string' ? d.createTime : (issue.created_at || new Date().toISOString()),
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
function invalidateList() { listCache.at = 0 }

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

const hits = new Map()
function rateOk(ip, limit, windowMs) {
  const key = `${ip}|${limit}|${windowMs}`
  const now = Date.now()
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) { hits.set(key, arr); return false }
  arr.push(now); hits.set(key, arr)
  return true
}

function json(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  })
  res.end(body)
}

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => {
      n += c.length
      if (n > BODY_MAX) {
        req.destroy()
        resolve({ tooLarge: true })
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8')
      if (!s) return resolve({ body: {} })
      try {
        const body = JSON.parse(s)
        resolve(body && typeof body === 'object' ? { body } : { bad: true })
      } catch {
        resolve({ bad: true })
      }
    })
    req.on('error', () => resolve({ bad: true }))
  })
}

const DATA_IMG_RE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/
async function saveUploadedImage(dataUri) {
  const m = DATA_IMG_RE.exec(dataUri)
  if (!m) return null
  const ext = m[1].replace('jpeg', 'jpg')
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length || buf.length > 5 * 1024 * 1024) return null
  const name = `${Date.now()}-${randomBytes(5).toString('hex')}.${ext}`
  await mkdir(UPLOADS, { recursive: true })
  await writeFile(join(UPLOADS, name), buf)
  return `/uploads/${name}`
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

async function handleApi(req, res, pathname) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'anon'
  const isWrite = req.method === 'POST'
  if (!rateOk(ip, isWrite ? 40 : 120, 10 * 60 * 1000)) return json(res, 429, { error: '请求过于频繁，请稍后再试' })
  let m

  if (req.method === 'GET' && pathname === '/api/items') {
    try {
      return json(res, 200, await getList())
    } catch {
      return json(res, 502, { error: '读取失败，请稍后再试' })
    }
  }

  if (req.method !== 'POST') return json(res, 405, { error: '仅支持 GET/POST' })

  if (pathname === '/api/items') {
    if (!rateOk(ip, 12, 60 * 60 * 1000)) return json(res, 429, { error: '发布过于频繁，请一小时后再试' })
    const parsed = await readBody(req)
    if (parsed.tooLarge) return json(res, 413, { error: '内容过大，请压缩图片后重试' })
    if (parsed.bad || !parsed.body) return json(res, 400, { error: '请求内容无法解析，请重试' })
    const b = parsed.body
    const name = sanitizeText(b.name, NAME_MAX)
    const desc = sanitizeText(b.desc, DESC_MAX)
    const ownerPhone = String(b.ownerPhone || '').trim()
    if (!name) return json(res, 400, { error: '缺少物品名称' })
    if (!desc) return json(res, 400, { error: '缺少物品描述' })
    if (!isValidPhone(ownerPhone)) return json(res, 400, { error: '发布者手机号格式不正确' })
    const contactType = b.contactType === 'building' ? 'building' : 'phone'
    const contact = sanitizeText(b.contact, CONTACT_MAX)
    if (!contact) return json(res, 400, { error: '缺少联系方式' })
    if (contactType === 'phone' && !isValidPhone(contact)) {
      return json(res, 400, { error: '联系手机号格式不正确' })
    }
    let imgUrl = String(b.imgUrl || '')
    if (imgUrl.startsWith('data:image/')) {
      const saved = await saveUploadedImage(imgUrl)
      if (!saved) return json(res, 400, { error: '图片过大或格式不支持，请换一张更小的图片' })
      imgUrl = saved
    } else {
      imgUrl = safeImgUrl(imgUrl)
      if (String(b.imgUrl || '').trim() && !imgUrl) {
        return json(res, 400, { error: '图片格式不支持，请换一张 jpeg/png/webp' })
      }
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
    const r = await ghWrite('', 'POST', { title: `[闲置物品] ${data.name}`, body, labels: ['item'] })
    if (!r.ok) {
      return json(res, r.status === 422 ? 413 : 502, {
        error: r.status === 422 ? '内容过长或含不支持的字符，请精简后重试' : '发布失败，请稍后再试',
      })
    }
    const created = await r.json()
    invalidateList()
    return json(res, 200, { ok: true, id: created.number })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/borrow$/))) {
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 502, { error: '服务暂时不可用，请稍后再试' })
    const parsed = await readBody(req)
    if (parsed.tooLarge || parsed.bad) return json(res, 400, { error: '请求内容无法解析，请重试' })
    const phone = requirePhone(parsed.body?.operatorPhone)
    if (!phone) return json(res, 400, { error: '手机号格式不正确' })
    if (issue.state !== 'open') return json(res, 409, { error: '该物品已下架' })
    const data = extractData(issue.body)
    if (isLentIssue(issue, data)) return json(res, 409, { error: '该物品当前不可借用' })
    if (isOwner(data, phone)) return json(res, 409, { error: '不能借用自己发布的物品' })
    data.borrowedBy = phone
    data.borrowedAt = new Date().toISOString()
    delete data.receiptHmac
    delete data.pinHmac
    const patch = await ghWrite(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
    if (!patch.ok) return json(res, 502, { error: '借用失败，请稍后再试' })
    await ghWrite(`/${issue.number}/labels`, 'POST', { labels: ['lent'] })
    invalidateList()
    return json(res, 200, { ok: true })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/return$/))) {
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 502, { error: '服务暂时不可用，请稍后再试' })
    const parsed = await readBody(req)
    if (parsed.tooLarge || parsed.bad) return json(res, 400, { error: '请求内容无法解析，请重试' })
    const phone = requirePhone(parsed.body?.operatorPhone)
    if (!phone) return json(res, 400, { error: '手机号格式不正确' })
    const data = extractData(issue.body)
    if (!isLentIssue(issue, data)) return json(res, 409, { error: '该物品当前未借出' })
    if (!isBorrower(data, phone)) return json(res, 403, { error: '只有借阅人可以归还' })
    delete data.borrowedBy
    delete data.borrowedAt
    delete data.receiptHmac
    const patch = await ghWrite(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
    if (!patch.ok) return json(res, 502, { error: '归还失败，请稍后再试' })
    await ghWrite(`/${issue.number}/labels/lent`, 'DELETE')
    invalidateList()
    return json(res, 200, { ok: true })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/(archive|unarchive)$/))) {
    const wantClosed = m[2] === 'archive'
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 502, { error: '服务暂时不可用，请稍后再试' })
    const parsed = await readBody(req)
    if (parsed.tooLarge || parsed.bad) return json(res, 400, { error: '请求内容无法解析，请重试' })
    const phone = requirePhone(parsed.body?.operatorPhone)
    if (!phone) return json(res, 400, { error: '手机号格式不正确' })
    const data = extractData(issue.body)
    if (!isOwner(data, phone)) return json(res, 403, { error: '只有发布者可以管理这件物品' })
    const patch = await ghWrite(`/${issue.number}`, 'PATCH', { state: wantClosed ? 'closed' : 'open' })
    if (!patch.ok) return json(res, 502, { error: '操作失败，请稍后再试' })
    invalidateList()
    return json(res, 200, { ok: true })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/delete$/))) {
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 502, { error: '服务暂时不可用，请稍后再试' })
    const parsed = await readBody(req)
    if (parsed.tooLarge || parsed.bad) return json(res, 400, { error: '请求内容无法解析，请重试' })
    const phone = requirePhone(parsed.body?.operatorPhone)
    if (!phone) return json(res, 400, { error: '手机号格式不正确' })
    const data = extractData(issue.body)
    if (!isOwner(data, phone)) return json(res, 403, { error: '只有发布者可以删除这件物品' })
    if (isLentIssue(issue, data)) return json(res, 409, { error: '物品借出中，请先收回再删除' })
    await ghWrite(`/${issue.number}/labels/item`, 'DELETE')
    await ghWrite(`/${issue.number}`, 'PATCH', { state: 'closed' })
    invalidateList()
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { error: '未找到接口' })
}

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = normalize(join(DIST, rel))
  if (!file.startsWith(DIST)) { res.writeHead(403, SECURITY_HEADERS); return res.end() }
  try {
    const st = await stat(file)
    const target = st.isDirectory() ? join(file, 'index.html') : file
    const buf = await readFile(target)
    const ext = '.' + (target.split('.').pop() || '')
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      ...SECURITY_HEADERS,
    })
    res.end(buf)
  } catch {
    try {
      const buf = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS })
      res.end(buf)
    } catch { res.writeHead(404, SECURITY_HEADERS); res.end('not found') }
  }
}

async function serveUpload(res, pathname) {
  const name = pathname.slice('/uploads/'.length)
  if (!/^[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(name)) { res.writeHead(404, SECURITY_HEADERS); return res.end() }
  try {
    const buf = await readFile(join(UPLOADS, name))
    const ext = '.' + name.split('.').pop().toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'image/jpeg',
      'Cache-Control': 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(buf)
  } catch { res.writeHead(404, SECURITY_HEADERS); res.end('not found') }
}

createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname
  try {
    if (pathname.startsWith('/api/')) {
      if (req.headers['x-site-key'] !== SITE_KEY) return json(res, 403, { error: '站点密钥错误' })
      return await handleApi(req, res, pathname)
    }
    if (pathname.startsWith('/uploads/')) return await serveUpload(res, pathname)
    return await serveStatic(res, pathname)
  } catch {
    return json(res, 500, { error: '服务暂时不可用，请稍后再试' })
  }
}).listen(PORT, HOST, () => {
  console.log(`linli proxy+static on http://${HOST}:${PORT}`)
})
