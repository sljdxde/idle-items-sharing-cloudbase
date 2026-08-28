// ================================================
// scripts/gen-items.mjs — 生成 public/items.json（GitHub Issues → 物品快照）
// 供 GitHub Pages 部署工作流调用：读取仓库 Issues（带 DATA 块），
// 映射为前端 Item[]，写入 public/items.json（构建时拷贝进 dist/，站点同源读取）。
// 鉴权：优先用 GITHUB_TOKEN，否则匿名（公开仓库，60 次/小时/IP）。
// ================================================

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'sljdxde/idle-items-sharing-cloudbase'
const GH_API = `https://api.github.com/repos/${REPO}`
const ITEM_LABEL = 'item'
const LENT_LABEL = 'lent'
const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/m

const CATEGORIES = [
  'home', 'electronics', 'kids', 'outdoor',
  'tools', 'books', 'clothing', 'other',
]
function normalizeCategory(v) {
  return CATEGORIES.includes(v) ? v : 'other'
}

function parseIssue(issue) {
  if (!issue || issue.pull_request) return null
  const body = issue.body || ''
  let d = {}
  const m = DATA_RE.exec(body)
  if (m) {
    try {
      d = JSON.parse(m[1].trim())
    } catch {
      d = {}
    }
  }
  const labels = (issue.labels || []).map((l) => l.name)
  const isLent = labels.includes(LENT_LABEL)
  const isArchived = issue.state === 'closed'

  let imgUrl = typeof d.imgUrl === 'string' ? d.imgUrl : ''
  if (!imgUrl) {
    const img = body.match(/https:\/\/user-images\.githubusercontent\.com\/[^\s)"']+/)
    if (img) imgUrl = img[0]
  }

  const name = (typeof d.name === 'string' && d.name) || issue.title || '未命名物品'
  const statusVal = typeof d.status === 'string' ? d.status : ''
  const status =
    statusVal === 'borrowed' || statusVal === 'requested'
      ? statusVal
      : isLent
        ? 'borrowed'
        : 'available'

  return {
    id: issue.number,
    name,
    desc: typeof d.desc === 'string' ? d.desc : '',
    contact: typeof d.contact === 'string' ? d.contact : '',
    building: typeof d.building === 'string' ? d.building : '',
    imgUrl,
    status,
    requests: [],
    category: normalizeCategory(typeof d.category === 'string' ? d.category : ''),
    createTime: issue.created_at || new Date().toISOString(),
    archived: isArchived,
  }
}

async function fetchIssues() {
  const headers = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const url = `${GH_API}/issues?state=open&per_page=100&labels=${ITEM_LABEL}&sort=updated`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const issues = await res.json()
  return issues.map(parseIssue).filter(Boolean)
}

async function main() {
  let items = []
  let ok = false
  try {
    items = await fetchIssues()
    ok = true
    console.log(`gen-items: 从 GitHub 读取到 ${items.length} 件在架物品`)
  } catch (e) {
    console.warn('gen-items: 读取 GitHub 失败，保留既有 items.json:', e.message)
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, 'items.json')

  if (ok) {
    writeFileSync(outFile, JSON.stringify(items, null, 2) + '\n', 'utf8')
    console.log('gen-items: 已写入 public/items.json')
  } else if (!existsSync(outFile)) {
    // 首次且无网络：写入空数组，前端以种子兜底
    writeFileSync(outFile, '[]\n', 'utf8')
    console.log('gen-items: 无既有文件，写入空数组（前端种子兜底）')
  } else {
    console.log('gen-items: 保留既有 public/items.json')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
