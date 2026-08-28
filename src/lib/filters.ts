// ================================================
// src/lib/filters.ts — 纯函数筛选器（可单测的 seam）
// 分类 → 关键词搜索 → 状态(默认隐藏已借出) → 距离半径 → 最新排序
// ================================================

import type { CategoryId, Item } from './types'
import { normalizeCategory } from './categories'
import { distanceKm, itemLatLng, type LatLng } from './geo'

/** 「6月12日」式短日期；无效时间返回「刚刚」 */
export function formatDateShort(iso: string): string {
  if (!iso) return '刚刚'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '刚刚'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function matchesCategory(item: Item, category: CategoryId | 'all'): boolean {
  if (category === 'all') return true
  return normalizeCategory(item.category ?? '') === category
}

export function matchesSearch(item: Item, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const haystack =
    `${item.name} ${item.desc} ${item.contactType === 'building' ? item.contact : ''}`.toLowerCase()
  return haystack.includes(q)
}

/**
 * 距离筛选：radius='all' 或用户未定位时不限制；
 * 物品无定位时**不排除**（显示为「距离未知」，排在列表末尾），避免发布者找不到自己的物品
 */
export function matchesRadius(
  item: Item,
  userPos: LatLng | null,
  radius: number | 'all',
): boolean {
  if (radius === 'all' || !userPos) return true
  const p = itemLatLng(item)
  if (!p) return true // 无定位物品始终可见（标注距离未知）
  return distanceKm(userPos, p) <= radius
}

/** 最新优先（时间相同按 id 降序）；返回新数组，不改入参 */
export function sortByNewest(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.createTime).getTime() - new Date(a.createTime).getTime() || b.id - a.id,
  )
}

export interface FilterState {
  category: CategoryId | 'all'
  search: string
}

export function filterItems(items: Item[], f: FilterState): Item[] {
  return sortByNewest(
    items.filter(
      (it) => matchesCategory(it, f.category) && matchesSearch(it, f.search),
    ),
  )
}
