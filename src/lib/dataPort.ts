// ================================================
// src/lib/dataPort.ts — 数据导出 / 导入（纯函数，可单测）
// 跨设备不共享是设计前提；导出 JSON 文件是官方迁移通道
// ================================================

import type { Item } from './types'
import { normalizeCategory } from './categories'

/** 导出：物品数组 → 带元信息的 JSON 文本 */
export function exportItems(items: Item[]): string {
  const payload = {
    app: 'linli-haowu',
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  }
  return JSON.stringify(payload, null, 2)
}

/** 导出文件名：linli-haowu-YYYYMMDD-HHmm.json */
export function exportFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `linli-haowu-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`
}

function normalizeImported(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'number' || typeof o.name !== 'string') return null
  const contactType = o.contactType === 'building' ? 'building' : 'phone'
  return {
    id: o.id,
    name: o.name,
    desc: typeof o.desc === 'string' ? o.desc : '',
    contactType,
    contact: typeof o.contact === 'string' ? o.contact : '',
    imgUrl: typeof o.imgUrl === 'string' ? o.imgUrl : '',
    status: o.status === 'lent' ? 'lent' : 'available',
    borrowedBy: typeof o.borrowedBy === 'string' ? o.borrowedBy : undefined,
    borrowedAt: typeof o.borrowedAt === 'string' ? o.borrowedAt : undefined,
    ownerPhone: typeof o.ownerPhone === 'string' ? o.ownerPhone : '',
    lat: typeof o.lat === 'number' && Number.isFinite(o.lat) ? o.lat : null,
    lng: typeof o.lng === 'number' && Number.isFinite(o.lng) ? o.lng : null,
    category: normalizeCategory(typeof o.category === 'string' ? o.category : ''),
    createTime: typeof o.createTime === 'string' ? o.createTime : new Date().toISOString(),
    archived: o.archived === true,
  }
}

/**
 * 导入：JSON 文本 → 规范化物品数组；任何不合法都返回 null（不抛异常）。
 * 兼容两种格式：导出文件的 {items:[...]} 包装格式，或裸数组 [...]。
 */
export function parseImportedItems(text: string): Item[] | null {
  try {
    const parsed = JSON.parse(text)
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown })?.items)
        ? (parsed as { items: unknown[] }).items
        : null
    if (!arr) return null
    const items = arr.map(normalizeImported).filter((x): x is Item => x !== null)
    // 至少要有 1 条合法记录，且 id 不重复
    if (items.length === 0) return null
    const ids = new Set(items.map((x) => x.id))
    if (ids.size !== items.length) return null
    return items
  } catch {
    return null
  }
}
