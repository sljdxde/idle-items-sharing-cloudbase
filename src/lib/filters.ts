// ================================================
// src/lib/filters.ts — 纯函数筛选器（可单测的 seam）
// 首页列表 = 分类 → 关键词搜索 → 距离 → 排序
// ================================================

import type { CategoryId, Item } from './types'
import { normalizeCategory } from './categories'

/** Haversine 距离（米） */
export function calcDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`
}

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
  const haystack = `${item.name} ${item.desc} ${item.building}`.toLowerCase()
  return haystack.includes(q)
}

/** rangeMeters<=0 表示不限距离；未定位或物品缺坐标时不因距离被过滤 */
export function withinRange(
  item: Item,
  user: { lat: number; lng: number } | null,
  rangeMeters: number,
): boolean {
  if (rangeMeters <= 0) return true
  if (!user || item.lat == null || item.lng == null) return true
  return calcDistance(user.lat, user.lng, item.lat, item.lng) <= rangeMeters
}

export type SortMode = 'distance' | 'newest'

/**
 * 排序：已定位 → 距离升序（缺坐标沉底）；未定位 → 发布时间降序。
 * 返回新数组，不改入参。
 */
export function sortItems(
  items: Item[],
  user: { lat: number; lng: number } | null,
): Item[] {
  const withDist = items.map((item) => ({
    item,
    dist:
      user && item.lat != null && item.lng != null
        ? calcDistance(user.lat, user.lng, item.lat, item.lng)
        : Number.POSITIVE_INFINITY,
  }))
  if (user) {
    withDist.sort((a, b) => a.dist - b.dist)
  } else {
    withDist.sort(
      (a, b) =>
        new Date(b.item.createTime).getTime() -
        new Date(a.item.createTime).getTime(),
    )
  }
  return withDist.map((x) => x.item)
}

export interface FilterState {
  category: CategoryId | 'all'
  search: string
  rangeMeters: number
  user: { lat: number; lng: number } | null
}

export function filterItems(items: Item[], f: FilterState): Item[] {
  return sortItems(
    items.filter(
      (it) =>
        matchesCategory(it, f.category) &&
        matchesSearch(it, f.search) &&
        withinRange(it, f.user, f.rangeMeters),
    ),
    f.user,
  )
}
