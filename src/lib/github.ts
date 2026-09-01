// ================================================
// src/lib/github.ts — 共享数据层读取端（写操作见 lib/api.ts → Cloudflare Worker）
// 读：items.json 同源快照 → 代理实时 → SEED_ITEMS 兜底
// 用户全程无感 GitHub：快照与代理均不向用户暴露任何 GitHub 概念。
// ================================================

import type { Item } from './types'
import { normalizeCategory } from './categories'
import { SEED_ITEMS } from './seed'
import { api } from './api'
import { safeImgUrl } from './safeImage'

/** Issue 体数据块标记（与 scripts/gen-items.mjs / cloudflare-worker 保持一致） */
export const DATA_START = '<!--DATA_START'
export const DATA_END = 'DATA_END-->'

// ---------- Issue → Item ----------

export interface IssueLike {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  created_at?: string
  labels?: Array<{ name?: string }>
}

interface DataBlock {
  name?: unknown
  desc?: unknown
  contactType?: unknown
  contact?: unknown
  imgUrl?: unknown
  category?: unknown
  ownerPhone?: unknown
  borrowedBy?: unknown
  borrowedAt?: unknown
  lat?: unknown
  lng?: unknown
  createTime?: unknown
}

/** 从 Issue body 提取 DATA 块 JSON；缺失/损坏返回 null */
export function extractDataBlock(body: string): DataBlock | null {
  const start = body.indexOf(DATA_START)
  const end = body.indexOf(DATA_END)
  if (start < 0 || end <= start) return null
  const json = body.slice(start + DATA_START.length, end).trim()
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as DataBlock) : null
  } catch {
    return null
  }
}

/** 「[闲置物品] 名称」→ 名称；无前缀原样返回 */
function cleanTitle(title: string): string {
  return title.replace(/^\[闲置物品\]\s*/, '').trim() || '未命名物品'
}

function roundCoord(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.round(n * 1000) / 1000
}

/** Issue → Item（lent 标签→已借出；closed→已下架） */
export function parseIssue(issue: IssueLike): Item {
  const data = extractDataBlock(issue.body ?? '') ?? {}
  const isLent = !!issue.labels?.some((l) => l.name === 'lent')
  return {
    id: issue.number,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : cleanTitle(issue.title),
    desc: typeof data.desc === 'string' ? data.desc : '',
    contactType: data.contactType === 'building' ? 'building' : 'phone',
    contact: typeof data.contact === 'string' ? data.contact : '',
    imgUrl: typeof data.imgUrl === 'string' ? safeImgUrl(data.imgUrl) : '',
    status: isLent ? 'lent' : 'available',
    ownerPhone: typeof data.ownerPhone === 'string' ? data.ownerPhone : undefined,
    borrowedBy: typeof data.borrowedBy === 'string' ? data.borrowedBy : undefined,
    borrowedAt: typeof data.borrowedAt === 'string' ? data.borrowedAt : undefined,
    lat: roundCoord(data.lat),
    lng: roundCoord(data.lng),
    category: normalizeCategory(typeof data.category === 'string' ? data.category : ''),
    createTime:
      typeof data.createTime === 'string' ? data.createTime : issue.created_at ?? new Date().toISOString(),
    archived: issue.state === 'closed',
  }
}

// ---------- 读取（三级兜底） ----------

/** 同源快照（CI 生成的 items.json；base './'，dev/Pages 均正确） */
async function fetchSnapshot(force: boolean): Promise<Item[] | null> {
  try {
    const res = await fetch(`items.json${force ? `?t=${Date.now()}` : ''}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const arr: unknown = await res.json()
    if (!Array.isArray(arr)) return null
    return arr
      .filter((x): x is Item => !!x && typeof x === 'object' && typeof (x as Item).id === 'number')
      .map((x) => ({
        ...x,
        imgUrl: safeImgUrl(x.imgUrl),
        lat: roundCoord(x.lat),
        lng: roundCoord(x.lng),
      }))
  } catch {
    return null
  }
}

/** 代理实时读取（写操作后立即刷新用，绕过快照缓存）；失败静默 */
async function fetchLive(): Promise<Item[] | null> {
  try {
    const items = await api.listItems()
    return items.length > 0 ? items : null
  } catch {
    return null
  }
}

/** 读取物品列表：items.json 快照 → 代理实时 → 种子兜底 */
export async function listItems(force = false): Promise<Item[]> {
  if (force) {
    const live = await fetchLive()
    if (live) return live
  }
  const snap = await fetchSnapshot(force)
  if (snap && snap.length > 0) return snap
  if (!force) {
    const live = await fetchLive()
    if (live) return live
  }
  return SEED_ITEMS
}
