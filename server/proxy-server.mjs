// ================================================
// server/proxy-server.mjs — 自建服务器版代理（与 cloudflare-worker/worker.js 同契约）
// Node 原生 http 实现：/api/* 走 GitHub 代理；其余路径服务 ./dist 静态站。
// 监听 127.0.0.1:8080，由 nginx 80 端口转发（无需 root 跑本进程）。
// Token 从环境变量 GITHUB_TOKEN 或同目录 .token 文件读取（chmod 600）。
// ================================================

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DIST = join(ROOT, 'dist')
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

// ─── GitHub 封装（与 worker 一致） ───
async function gh(path, method = 'GET', body) {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'neighborhood-proxy',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function extractData(body) {
  const m = body ? body.match(DATA_RE) : null
  if (!m || !m[1]) return {}
  try { return JSON.parse(m[1].trim()) } catch { return {} }
}

function toItem(issue) {
  const d = extractData(issue.body)
  const isLent = (issue.labels || []).some((l) => l.name === 'lent')
  return {
    id: issue.number,
    name: typeof d.name === 'string' && d.name.trim() ? d.name : String(issue.title || '').replace(/^\[闲置物品\]\s*/, '').trim() || '未命名物品',
    desc: typeof d.desc === 'string' ? d.desc : '',
    contactType: d.contactType === 'building' ? 'building' : 'phone',
    contact: typeof d.contact === 'string' ? d.contact : '',
    imgUrl: typeof d.imgUrl === 'string' ? d.imgUrl : '',
    status: isLent ? 'lent' : 'available',
    borrowedBy: typeof d.borrowedBy === 'string' ? d.borrowedBy : undefined,
    borrowedAt: typeof d.borrowedAt === 'string' ? d.borrowedAt : undefined,
    ownerPhone: typeof d.ownerPhone === 'string' ? d.ownerPhone : '',
    lat: typeof d.lat === 'number' && Number.isFinite(d.lat) ? d.lat : null,
    lng: typeof d.lng === 'number' && Number.isFinite(d.lng) ? d.lng : null,
    category: typeof d.category === 'string' ? d.category : 'other',
    createTime: typeof d.createTime === 'string' ? d.createTime : (issue.created_at || new Date().toISOString()),
    archived: issue.state === 'closed',
  }
}

function withDataBlock(oldBody, data) {
  const block = `<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->`
  return DATA_RE.test(oldBody || '') ? (oldBody || '').replace(DATA_RE, () => block) : `${oldBody || ''}\n\n${block}`
}

async function readIssue(num) {
  const res = await gh(`/${num}`)
  if (res.status === 404) return { missing: true }
  if (!res.ok) return { error: `GitHub API 错误: ${res.status}` }
  return { issue: await res.json() }
}

// ─── 规模化：分页列表（>100 物品不丢数据） ───
async function listAllIssues() {
  const out = []
  for (let page = 1; page <= 5; page++) {
    const r = await gh(`?state=all&labels=item&per_page=100&sort=updated&direction=desc&page=${page}`)
    if (!r.ok) return { error: `GitHub API 错误: ${r.status}` }
    const arr = await r.json()
    out.push(...arr)
    if (arr.length < 100) break
  }
  return { issues: out }
}

// ─── 规模化：5s 列表缓存 + single-flight（并发读只打一次 GitHub；写后主动失效） ───
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
        if (error) throw new Error(error)
        listCache = { at: Date.now(), data: issues.map(toItem) }
        return listCache.data
      } finally {
        listInflight = null
      }
    })()
  }
  return listInflight
}

// ─── 规模化：写操作遇二级限流退避重试 ───
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

// ─── 限流（内存；小区 NAT 场景整栋楼共享出口 IP，阈值需宽松） ───
const hits = new Map()
function rateOk(ip) {
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000)
  if (arr.length >= 600) { hits.set(ip, arr); return false }
  arr.push(now); hits.set(ip, arr)
  return true
}

function json(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(body)
}

async function readBody(req) {
  return new Promise((resolve) => {
    let s = ''
    req.on('data', (c) => { s += c; if (s.length > 2_000_000) req.destroy() })
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}) } catch { resolve({}) } })
  })
}

// ─── API 路由（与 worker 同契约） ───
async function handleApi(req, res, pathname) {
  if (!rateOk(req.socket.remoteAddress || 'anon')) return json(res, 429, { error: '请求过于频繁，请稍后再试' })
  let m

  if (req.method === 'GET' && pathname === '/api/items') {
    try {
      return json(res, 200, await getList())
    } catch (e) {
      return json(res, 500, { error: e.message })
    }
  }

  if (req.method !== 'POST') return json(res, 405, { error: '仅支持 GET/POST' })

  if (pathname === '/api/items') {
    const b = await readBody(req)
    if (!String(b.name || '').trim()) return json(res, 400, { error: '缺少物品名称' })
    if (!String(b.ownerPhone || '').trim()) return json(res, 400, { error: '缺少发布者手机号' })
    const data = {
      name: String(b.name).trim(),
      desc: String(b.desc || ''),
      contactType: b.contactType === 'building' ? 'building' : 'phone',
      contact: String(b.contact || ''),
      imgUrl: String(b.imgUrl || ''),
      category: String(b.category || 'other'),
      ownerPhone: String(b.ownerPhone).trim(),
      lat: Number.isFinite(b.lat) ? b.lat : null,
      lng: Number.isFinite(b.lng) ? b.lng : null,
      createTime: new Date().toISOString(),
    }
    const body = `${data.desc}\n\n<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->\n\n— 以下为自动生成的数据块，请勿删除 —`
    const r = await ghWrite('', 'POST', { title: `[闲置物品] ${data.name}`, body, labels: ['item'] })
    if (!r.ok) { const e = await r.json().catch(() => ({})); return json(res, r.status, { error: e.message || '发布失败，请稍后再试' }) }
    const created = await r.json()
    invalidateList()
    return json(res, 200, { ok: true, id: created.number })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/borrow$/))) {
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 500, { error })
    const b = await readBody(req)
    const phone = String(b.operatorPhone || '').trim()
    if (!phone) return json(res, 400, { error: '请先登录' })
    if (issue.state !== 'open') return json(res, 409, { error: '该物品已下架' })
    const data = extractData(issue.body)
    if ((issue.labels || []).some((l) => l.name === 'lent')) return json(res, 409, { error: '该物品当前不可借用' })
    if (data.ownerPhone === phone) return json(res, 409, { error: '不能借用自己发布的物品' })
    data.borrowedBy = phone
    data.borrowedAt = new Date().toISOString()
    await ghWrite(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
    await ghWrite(`/${issue.number}/labels`, 'POST', { labels: ['lent'] })
    invalidateList()
    return json(res, 200, { ok: true })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/return$/))) {
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 500, { error })
    const b = await readBody(req)
    const phone = String(b.operatorPhone || '').trim()
    const data = extractData(issue.body)
    if (!phone || data.borrowedBy !== phone) return json(res, 403, { error: '只有借阅人本人可以操作归还' })
    delete data.borrowedBy
    delete data.borrowedAt
    await ghWrite(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) })
    await ghWrite(`/${issue.number}/labels/lent`, 'DELETE')
    invalidateList()
    return json(res, 200, { ok: true })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/(archive|unarchive)$/))) {
    const wantClosed = m[2] === 'archive'
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 500, { error })
    const b = await readBody(req)
    const phone = String(b.operatorPhone || '').trim()
    const data = extractData(issue.body)
    if (!phone || data.ownerPhone !== phone) return json(res, 403, { error: '只有发布者可以管理自己的物品' })
    await ghWrite(`/${issue.number}`, 'PATCH', { state: wantClosed ? 'closed' : 'open' })
    invalidateList()
    return json(res, 200, { ok: true })
  }

  if ((m = pathname.match(/^\/api\/items\/(\d+)\/delete$/))) {
    const { issue, missing, error } = await readIssue(+m[1])
    if (missing) return json(res, 404, { error: '物品不存在' })
    if (error) return json(res, 500, { error })
    const b = await readBody(req)
    const phone = String(b.operatorPhone || '').trim()
    const data = extractData(issue.body)
    if (!phone || data.ownerPhone !== phone) return json(res, 403, { error: '只有发布者可以删除自己的物品' })
    // GitHub Issue 无法物理删除：移除 item 标签 + 关闭，即从全站彻底消失
    await ghWrite(`/${issue.number}/labels/item`, 'DELETE')
    await ghWrite(`/${issue.number}`, 'PATCH', { state: 'closed' })
    invalidateList()
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { error: '未找到接口' })
}

// ─── 静态站 ───
async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = normalize(join(DIST, rel))
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end() }
  try {
    const st = await stat(file)
    const target = st.isDirectory() ? join(file, 'index.html') : file
    const buf = await readFile(target)
    const ext = '.' + (target.split('.').pop() || '')
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    })
    res.end(buf)
  } catch {
    // hash 路由 SPA：找不到文件回 index.html
    try {
      const buf = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' })
      res.end(buf)
    } catch { res.writeHead(404); res.end('not found') }
  }
}

createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname
  try {
    if (pathname.startsWith('/api/')) {
      if (req.headers['x-site-key'] !== SITE_KEY) return json(res, 403, { error: '站点密钥错误' })
      return await handleApi(req, res, pathname)
    }
    return await serveStatic(res, pathname)
  } catch (e) {
    return json(res, 500, { error: '服务暂时不可用，请稍后再试' })
  }
}).listen(PORT, HOST, () => {
  console.log(`linli proxy+static on http://${HOST}:${PORT}`)
})
