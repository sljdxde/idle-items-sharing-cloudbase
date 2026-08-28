// ================================================
// scripts/gen-items.mjs — 从 GitHub Issues 生成 public/items.json 静态快照
// 在 GitHub Actions 中运行（有 GITHUB_TOKEN 时高配额；否则匿名）
// 规则与 src/lib/github.ts 的 parseIssue 保持一致：
//   - 带 item 标签的 Issue = 一条物品（含 closed = 已下架）
//   - lent 标签 → status=lent；closed → archived=true
//   - body 中 <!--DATA_START ... DATA_END--> 为数据块
// ================================================

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'sljdxde/idle-items-sharing-cloudbase'
const GH_API = 'https://api.github.com/repos'
const TOKEN = process.env.GITHUB_TOKEN ?? ''
const DATA_START = '<!--DATA_START'
const DATA_END = 'DATA_END-->'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'items.json')

async function api(path) {
  const headers = { Accept: 'application/vnd.github+json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
  const res = await fetch(`${GH_API}/${REPO}${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

function extractData(body) {
  if (!body) return null
  const start = body.indexOf(DATA_START)
  const end = body.indexOf(DATA_END)
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(body.slice(start + DATA_START.length, end).trim())
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function cleanTitle(title) {
  return String(title ?? '').replace(/^\[闲置物品\]\s*/, '').trim() || '未命名物品'
}

function parseIssue(issue) {
  const data = extractData(issue.body) ?? {}
  const isLent = (issue.labels ?? []).some((l) => l.name === 'lent')
  return {
    id: issue.number,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : cleanTitle(issue.title),
    desc: typeof data.desc === 'string' ? data.desc : '',
    contactType: data.contactType === 'building' ? 'building' : 'phone',
    contact: typeof data.contact === 'string' ? data.contact : '',
    imgUrl: typeof data.imgUrl === 'string' ? data.imgUrl : '',
    status: isLent ? 'lent' : 'available',
    borrowedBy: typeof data.borrowedBy === 'string' ? data.borrowedBy : undefined,
    borrowedAt: typeof data.borrowedAt === 'string' ? data.borrowedAt : undefined,
    ownerPhone: typeof data.ownerPhone === 'string' ? data.ownerPhone : '',
    lat: typeof data.lat === 'number' && Number.isFinite(data.lat) ? data.lat : null,
    lng: typeof data.lng === 'number' && Number.isFinite(data.lng) ? data.lng : null,
    category: typeof data.category === 'string' ? data.category : 'other',
    createTime:
      typeof data.createTime === 'string'
        ? data.createTime
        : issue.created_at ?? new Date().toISOString(),
    archived: issue.state === 'closed',
  }
}

async function main() {
  try {
    const issues = await api(`/issues?state=all&labels=item&per_page=100&sort=updated&direction=desc`)
    const items = issues.map(parseIssue)
    // 空目录不被 git 跟踪，checkout 后 public/ 可能不存在，先建目录
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, JSON.stringify(items, null, 2), 'utf8')
    console.log(`gen-items: 已写入 ${items.length} 件物品 -> public/items.json`)
  } catch (err) {
    console.error(`gen-items: 失败（${err.message}），保留旧快照或写空数组`)
    try {
      writeFileSync(OUT, '[]', 'utf8')
    } catch {
      /* ignore */
    }
    process.exitCode = 1
  }
}

main()
