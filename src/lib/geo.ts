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

export type LocateFailReason = 'insecure' | 'unsupported' | 'denied' | 'timeout'

export interface LocateResult {
  pos: LatLng | null
  reason?: LocateFailReason
}

/**
 * 获取浏览器定位；任何失败都 resolve（绝不 reject），并附失败原因：
 * - insecure：HTTP 非安全上下文，浏览器禁用定位 API（自建服务器 IP 直连场景）
 * - unsupported：环境无定位 API（如 SSR/旧内核）
 * - denied：用户拒绝授权或系统定位服务被关
 * - timeout：定位超时（室内信号弱常见）
 */
export function getBrowserLocation(timeoutMs = 8000): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const insecure = typeof window !== 'undefined' && window.isSecureContext === false
      resolve({ pos: null, reason: insecure ? 'insecure' : 'unsupported' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ pos: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) => {
        // HTTP 下部分内核仍暴露 geolocation 对象、但调用必然失败——根因是协议，优先报 insecure
        const insecure = typeof window !== 'undefined' && window.isSecureContext === false
        resolve({
          pos: null,
          reason: insecure ? 'insecure' : err.code === 1 ? 'denied' : 'timeout',
        })
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 },
    )
  })
}
