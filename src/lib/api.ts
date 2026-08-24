// ================================================
// src/lib/api.ts — ItemStore 数据层（module）
// 读取三级降级链（与 v1 行为一致）：
//   ① 同源静态快照 items.json（非空采信，无速率限制）
//   ② 本地缓存（5 分钟 TTL）→ 匿名 GitHub API
//   ③ 全部失败 → 空数组（页面显示空状态，不中断）
// 写入：前端零凭证。发布 = 预填 GitHub Issue 创建页；
//       管理 = 物主在 GitHub 加/去 lent 标签、关 Issue 下架。
// ================================================

import { GH_API, GH_REPO, LIST_CACHE_KEY, LIST_CACHE_TTL, REPO_URL } from './config'
import type { BorrowRequest, CategoryId, Item, ItemStatus } from './types'
import { normalizeCategory } from './categories'

const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/

// ─── 内部：解析 ───

interface RawIssue {
  number: number
  title?: string
  body?: string | null
  created_at: string
  labels?: Array<{ name?: string }>
}

function statusFrom(d: Partial<Item>, issue: RawIssue): ItemStatus {
  if (d.status === 'available' || d.status === 'requested' || d.status === 'borrowed') {
    return d.status
  }
  const lent = (issue.labels ?? []).some((l) => l.name === 'lent')
  return lent ? 'borrowed' : 'available'
}

export function parseIssue(issue: RawIssue): Item | null {
  try {
    const m = issue.body ? issue.body.match(DATA_RE) : null
    let d: Record<string, unknown> = {}
    if (m && m[1]) d = JSON.parse(m[1].trim()) as Record<string, unknown>
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '')

    let imgUrl = str('imgUrl')
    if (!imgUrl && issue.body) {
      const im = issue.body.match(
        /https:\/\/user-images\.githubusercontent\.com[^\s)>"']+/,
      )
      if (im) imgUrl = im[0]
    }

    return {
      id: issue.number,
      name: str('name') || issue.title || '未知物品',
      desc: str('desc'),
      contact: str('contact'),
      building: str('building'),
      lat: typeof d.lat === 'number' ? (d.lat as number) : null,
      lng: typeof d.lng === 'number' ? (d.lng as number) : null,
      imgUrl,
      status: statusFrom(d as Partial<Item>, issue),
      requests: Array.isArray(d.requests) ? (d.requests as BorrowRequest[]) : [],
      category: normalizeCategory(str('category') as CategoryId | ''),
      createTime: issue.created_at,
    }
  } catch (e) {
    console.warn('parseIssue 解析失败', issue.number, e)
    return null
  }
}

// ─── 内部：本地缓存（仅匿名 API 路径使用） ───

function readListCache(): Item[] | null {
  try {
    const raw = localStorage.getItem(LIST_CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as { t?: number; data?: unknown }
    if (
      typeof c.t === 'number' &&
      Date.now() - c.t < LIST_CACHE_TTL &&
      Array.isArray(c.data)
    ) {
      return c.data as Item[]
    }
  } catch {
    /* 忽略损坏缓存 */
  }
  return null
}

function writeListCache(arr: Item[]): void {
  try {
    localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ t: Date.now(), data: arr }))
  } catch {
    /* 存储满/隐私模式忽略 */
  }
}

// ─── 实时源：匿名 GitHub API（易 403，作兜底） ───

async function listFromApi(): Promise<Item[]> {
  const url = `${GH_API}/issues?state=open&per_page=100&labels=item&sort=updated`
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) {
    throw new Error(`加载失败: ${res.status}（如持续 403，请等待配额恢复）`)
  }
  const issues = (await res.json()) as RawIssue[]
  return issues.map(parseIssue).filter((x): x is Item => x !== null)
}

// ─── 公开接口 ───

export async function list(opts?: { forceLive?: boolean }): Promise<Item[]> {
  const forceLive = opts?.forceLive === true

  // ① 同源静态快照
  if (!forceLive) {
    try {
      const res = await fetch(`items.json?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const arr = (await res.json()) as unknown
        if (Array.isArray(arr) && arr.length > 0) return arr as Item[]
      }
    } catch (e) {
      console.warn('items.json 读取失败，尝试降级:', (e as Error).message)
    }
  }

  // ② 缓存 → 匿名 API
  try {
    if (!forceLive) {
      const cached = readListCache()
      if (cached) return cached
    }
    const live = await listFromApi()
    writeListCache(live)
    return live
  } catch (e) {
    console.warn('实时读取失败，返回空列表:', (e as Error).message)
    return []
  }
}

export interface PublishDraft {
  name: string
  desc: string
  contact: string
  building: string
  lat: number | null
  lng: number | null
  imgUrl: string
  category: CategoryId
}

/** 构造预填的 GitHub Issue 创建页 URL；用户登录后点 Submit 即上架 */
export function buildPublishUrl(item: PublishDraft): string {
  const title = `[闲置物品] ${item.name}`
  const data = {
    name: item.name,
    desc: item.desc,
    contact: item.contact,
    building: item.building,
    lat: item.lat,
    lng: item.lng,
    imgUrl: item.imgUrl,
    category: item.category,
    status: 'available',
    requests: [] as BorrowRequest[],
    createTime: new Date().toISOString(),
  }
  const body = `## 闲置物品：${item.name}

**分类**：${item.category}

**描述**：${item.desc || ''}

**联系 / 位置**：${
    item.contact || (item.building ? `楼号 ${item.building}` : '')
  }

> 本 Issue 由「邻里好物」创建，请勿修改下方隐藏数据块（DATA_START / DATA_END 之间）。

<!--DATA_START
${JSON.stringify(data)}
DATA_END-->`
  const params = new URLSearchParams({ title, body, labels: 'item' })
  return `${REPO_URL}/issues/new?${params.toString()}`
}

/** 物品对应的 GitHub Issue 页（借阅沟通 / 物主管理入口） */
export function issueUrl(id: number): string {
  return `${REPO_URL}/issues/${id}`
}

export const REPO_FULL = GH_REPO
