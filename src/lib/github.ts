// ================================================
// src/lib/github.ts — GitHub Issues 共享数据层（零服务器 / 零写凭证）
// 读：items.json 快照 → GitHub REST 实时 → SEED_ITEMS 兜底
// 写：发布 = 预填 issues/new 链接；借还/上下架 = 评论命令（Actions 自动处理）
// ================================================

import type { CategoryId, ContactType, Item } from './types'
import { normalizeCategory } from './categories'
import { SEED_ITEMS } from './seed'

export const REPO = 'sljdxde/idle-items-sharing-cloudbase'
export const REPO_URL = `https://github.com/${REPO}`
const GH_API = 'https://api.github.com/repos'

/** Issue 体数据块标记（与 scripts/gen-items.mjs / handle-comment.mjs 保持一致） */
export const DATA_START = '<!--DATA_START'
export const DATA_END = 'DATA_END-->'

/** 评论命令（与 scripts/handle-comment.mjs 保持一致） */
export const CMD_BORROW = '借用'
export const CMD_RETURN = '归还'
export const CMD_ARCHIVE = '下架'
export const CMD_UNARCHIVE = '上架'

export function borrowCommand(phone: string): string {
  return `${CMD_BORROW} ${phone.trim()}`
}
export const RETURN_COMMAND = CMD_RETURN
export const ARCHIVE_COMMAND = CMD_ARCHIVE
export const UNARCHIVE_COMMAND = CMD_UNARCHIVE

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
    imgUrl: typeof data.imgUrl === 'string' ? data.imgUrl : '',
    status: isLent ? 'lent' : 'available',
    borrowedBy: typeof data.borrowedBy === 'string' ? data.borrowedBy : undefined,
    borrowedAt: typeof data.borrowedAt === 'string' ? data.borrowedAt : undefined,
    ownerPhone: typeof data.ownerPhone === 'string' ? data.ownerPhone : '',
    lat: typeof data.lat === 'number' && Number.isFinite(data.lat) ? data.lat : null,
    lng: typeof data.lng === 'number' && Number.isFinite(data.lng) ? data.lng : null,
    category: normalizeCategory(typeof data.category === 'string' ? data.category : ''),
    createTime:
      typeof data.createTime === 'string' ? data.createTime : issue.created_at ?? new Date().toISOString(),
    archived: issue.state === 'closed',
  }
}

// ---------- 读取（三级兜底） ----------

interface GhItem {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  created_at: string
  labels: Array<{ name?: string }>
}

async function fetchSnapshot(force: boolean): Promise<Item[] | null> {
  try {
    const res = await fetch(`${REPO_URL}/items.json${force ? `?t=${Date.now()}` : ''}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const arr: unknown = await res.json()
    if (!Array.isArray(arr)) return null
    return arr
      .filter((x): x is Item => !!x && typeof x === 'object' && typeof (x as Item).id === 'number')
      .map((x) => ({ ...x }))
  } catch {
    return null
  }
}

async function fetchLive(force: boolean): Promise<Item[] | null> {
  try {
    const qs = new URLSearchParams({
      state: 'all',
      labels: 'item',
      per_page: '100',
      sort: 'updated',
      direction: 'desc',
    })
    if (force) qs.set('cache_bust', String(Date.now()))
    const res = await fetch(`${GH_API}/${REPO}/issues?${qs}`)
    if (!res.ok) return null
    const list = (await res.json()) as GhItem[]
    return list.map(parseIssue)
  } catch {
    return null
  }
}

/** 读取物品列表：items.json 快照 → 实时 API → 种子兜底 */
export async function listItems(force = false): Promise<Item[]> {
  const snap = await fetchSnapshot(force)
  if (snap && snap.length > 0) return snap
  const live = await fetchLive(force)
  if (live && live.length > 0) return live
  return SEED_ITEMS
}

// ---------- 发布（打开预填 issues/new） ----------

export interface PublishDraft {
  name: string
  desc: string
  contactType: ContactType
  contact: string
  imgUrl: string
  category: CategoryId
  /** 发布者手机号（登录用户） */
  ownerPhone: string
  /** 发布时定位；获取失败为 null */
  lat: number | null
  lng: number | null
}

export function buildPublishUrl(draft: PublishDraft): string {
  const data = {
    name: draft.name,
    desc: draft.desc,
    contactType: draft.contactType,
    contact: draft.contact,
    imgUrl: draft.imgUrl,
    category: draft.category,
    ownerPhone: draft.ownerPhone,
    borrowedBy: undefined,
    borrowedAt: undefined,
    lat: draft.lat,
    lng: draft.lng,
    createTime: new Date().toISOString(),
  }
  const block = `${DATA_START}\n${JSON.stringify(data)}\n${DATA_END}`
  const body = [
    draft.desc,
    '',
    block,
    '',
    '— 以下为自动生成的数据块，提交后请勿删除 —',
  ].join('\n')
  const params = new URLSearchParams({
    title: `[闲置物品] ${draft.name}`,
    body,
    labels: 'item',
  })
  return `${REPO_URL}/issues/new?${params.toString()}`
}

export function issueUrl(id: number): string {
  return `${REPO_URL}/issues/${id}`
}
