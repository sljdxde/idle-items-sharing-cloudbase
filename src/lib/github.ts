// ================================================
// src/lib/github.ts — GitHub Issues 后端（零服务器、零写凭证）
// 读取：同源 items.json 快照（由 GitHub Action 生成）→ 实时 API 兜底 → 种子兜底
// 写入：发布 = 打开预填的 GitHub Issue 创建页（用户登录后提交，Actions 自动同步回站点）
// 管理：在 GitHub 上对 Issue 加/去 lent 标签、关闭/重开，前端只读跟随
// ================================================

import type { CategoryId, Item } from './types'
import { normalizeCategory } from './categories'
import { SEED_ITEMS } from './seed'

export const REPO = 'sljdxde/idle-items-sharing-cloudbase'
export const REPO_URL = `https://github.com/${REPO}`
const GH_API = `https://api.github.com/repos/${REPO}`

const ITEM_LABEL = 'item'
const LENT_LABEL = 'lent'

const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/m
const CACHE_KEY = 'linli_haowu_github_cache_v1'
const CACHE_TTL = 5 * 60 * 1000

export interface PublishDraft {
  name: string
  desc: string
  contact: string
  building: string
  imgUrl: string
  category: CategoryId
}

// ── 本地缓存（仅降低匿名 API 限流风险，非数据源）──
function readCache(): Item[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { t: number; items: Item[] }
    if (Date.now() - parsed.t > CACHE_TTL) return null
    if (!Array.isArray(parsed.items)) return null
    return parsed.items
  } catch {
    return null
  }
}

function writeCache(items: Item[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items }))
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

/** 将 GitHub Issue 映射为 Item；无 DATA 块时按字段兜底解析 */
export function parseIssue(issue: any): Item | null {
  if (!issue || issue.pull_request) return null
  const body: string = issue.body || ''
  let d: Record<string, any> = {}
  const m = DATA_RE.exec(body)
  if (m) {
    try {
      d = JSON.parse(m[1].trim())
    } catch {
      d = {}
    }
  }
  const labels: string[] = (issue.labels || []).map((l: any) => l.name)
  const isLent = labels.includes(LENT_LABEL)
  const isArchived = issue.state === 'closed'

  let imgUrl = typeof d.imgUrl === 'string' ? d.imgUrl : ''
  if (!imgUrl) {
    const img = body.match(/https:\/\/user-images\.githubusercontent\.com\/[^\s)"']+/)
    if (img) imgUrl = img[0]
  }

  const name = (typeof d.name === 'string' && d.name) || issue.title || '未命名物品'
  const statusVal = typeof d.status === 'string' ? d.status : ''
  const status: Item['status'] =
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

/** 读取社区物品：快照优先，实时 API 兜底，种子最终兜底，保证页面始终有内容 */
export async function listItems(force = false): Promise<Item[]> {
  if (!force) {
    const cached = readCache()
    if (cached) return cached
  }
  // ① 同源静态快照（最稳，避开共享 IP 限流）
  try {
    const res = await fetch(`items.json?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) {
      const arr = await res.json()
      if (Array.isArray(arr) && arr.length) {
        writeCache(arr as Item[])
        return arr as Item[]
      }
    }
  } catch {
    /* 离线/网络错误，继续兜底 */
  }
  // ② 实时 API 兜底（匿名，可能 403）
  try {
    const res = await fetch(
      `${GH_API}/issues?state=open&per_page=100&labels=${ITEM_LABEL}&sort=updated`,
      { headers: { Accept: 'application/vnd.github+json' } },
    )
    if (res.ok) {
      const issues = (await res.json()) as any[]
      const arr = issues.map(parseIssue).filter((x): x is Item => x !== null)
      if (arr.length) {
        writeCache(arr)
        return arr
      }
    }
  } catch {
    /* 限流/网络错误，继续兜底 */
  }
  // ③ 种子兜底
  return SEED_ITEMS as Item[]
}

/** 构造预填的 GitHub Issue 创建链接（发布） */
export function buildPublishUrl(draft: PublishDraft): string {
  const name = draft.name.trim() || '未命名闲置'
  const data = {
    name: draft.name.trim(),
    desc: draft.desc.trim(),
    contact: draft.contact.trim(),
    building: draft.building.trim(),
    imgUrl: draft.imgUrl.trim(),
    category: draft.category,
    status: 'available',
    requests: [],
  }
  const bodyLines = [
    `## 闲置物品：${name}`,
    '',
    `**描述**：${data.desc || '（无）'}`,
    `**分类**：${data.category}`,
    `**联系方式**：${data.contact || '（未填）'}`,
    `**楼号门牌**：${data.building || '（未填）'}`,
    data.imgUrl ? `**图片**：${data.imgUrl}` : '',
    '',
    '> 本 Issue 由「邻里好物」站点自动生成。在 GitHub 上给本 Issue 添加 `lent` 标签表示已借出，移除标签表示已归还，关闭 Issue 表示下架。',
    '',
    '<!--DATA_START',
    JSON.stringify(data),
    'DATA_END-->',
  ]
    .filter((l) => l !== '')
    .join('\n')

  const params = new URLSearchParams()
  params.set('title', `[闲置物品] ${name}`)
  params.set('body', bodyLines)
  params.set('labels', ITEM_LABEL)
  return `${REPO_URL}/issues/new?${params.toString()}`
}

/** 物品对应 Issue 的网址 */
export function issueUrl(id: number): string {
  return `${REPO_URL}/issues/${id}`
}
