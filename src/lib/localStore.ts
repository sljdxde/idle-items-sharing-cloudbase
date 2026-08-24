// ================================================
// src/lib/localStore.ts — 本地持久化 ItemStore（离线小工具版）
// 数据保存在 localStorage（容器按小工具隔离）；首启导入种子数据。
// ================================================

import type { Item } from './types'
import { SEED_ITEMS } from './seed'

const STORAGE_KEY = 'linli_haowu_items_v1'

/** 深拷贝：structuredClone 在老 WebView（<Chrome98/Safari15.4）缺失，用 JSON 兜底 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function revive(raw: string): Item[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((x) => x && typeof x.id === 'number' && typeof x.name === 'string')
  } catch {
    return null
  }
}

/** 读取全部物品；空/损坏时写入种子数据并返回副本 */
export function loadItems(): Item[] {
  let items: Item[] | null = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    items = raw ? revive(raw) : null
  } catch {
    items = null // 隐私模式等场景：退化为内存态
  }
  if (!items || items.length === 0) {
    items = deepClone(SEED_ITEMS)
    saveItems(items)
  }
  return items
}

/** 持久化；返回 false 表示配额不足等失败（内存中仍生效） */
export function saveItems(items: Item[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

export function nextId(items: Item[]): number {
  return items.reduce((m, x) => Math.max(m, x.id), 0) + 1
}

/** 借阅请求等子资源 id */
export function uid(prefix = 'req'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
