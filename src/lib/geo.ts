// ================================================
// src/lib/geo.ts — 地理定位与距离（纯函数 seam，可单测）
// 列表默认展示距离用户 x 公里内的物品；x 为可配置参数（DEFAULT_RADIUS_KM）
// ================================================

import type { Item } from './types'

export interface LatLng {
  lat: number
  lng: number
}

/** 默认距离筛选半径（km）—— 可配置参数 x */
export const DEFAULT_RADIUS_KM = 5

/** 距离筛选可选项；'all' 表示不限距离 */
export const RADIUS_OPTIONS: Array<{ value: number | 'all'; label: string }> = [
  { value: 1, label: '1 公里内' },
  { value: 3, label: '3 公里内' },
  { value: 5, label: '5 公里内' },
  { value: 10, label: '10 公里内' },
  { value: 'all', label: '全部距离' },
]

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** 两点球面距离（haversine，单位 km） */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** 距离展示文案：<1km 用米，否则保留一位小数 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '距离未知'
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))}m`
  return `${km.toFixed(1)}km`
}

/** 物品定位；无定位返回 null */
export function itemLatLng(item: Item): LatLng | null {
  if (
    typeof item.lat === 'number' &&
    typeof item.lng === 'number' &&
    Number.isFinite(item.lat) &&
    Number.isFinite(item.lng)
  ) {
    return { lat: item.lat, lng: item.lng }
  }
  return null
}

/**
 * 获取浏览器定位；任何失败（不支持 / 拒绝 / 超时）都 resolve(null)，绝不 reject。
 * 组件侧拿到 null 时降级为「距离筛选未生效」，不阻塞浏览。
 */
export function getBrowserLocation(timeoutMs = 8000): Promise<LatLng | null> {
  return new Promise((resolve) => {
    const geo =
      typeof navigator !== 'undefined' && navigator.geolocation ? navigator.geolocation : null
    if (!geo) {
      resolve(null)
      return
    }
    geo.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 },
    )
  })
}
