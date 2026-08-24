// ================================================
// src/composables/useGeolocation.ts — 浏览器定位
// 成功后写入 items store；拒绝/失败自动回落「全部」距离档
// ================================================

import { useItemsStore } from '@/stores/items'

export interface GeoResult {
  ok: boolean
  lat?: number
  lng?: number
}

export function getLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('浏览器不支持定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  })
}

/** 首页定位：成功 → 已定位 + 保持当前距离档；失败 → 提示并回落「全部」 */
export async function locateForHome(): Promise<GeoResult> {
  const store = useItemsStore()
  store.locateStatus = 'locating'
  try {
    const pos = await getLocation()
    store.userLoc = pos
    store.locateStatus = 'ok'
    return { ok: true, ...pos }
  } catch {
    store.userLoc = null
    store.locateStatus =
      'geolocation' in navigator ? 'denied' : 'unsupported'
    store.setRange(0)
    return { ok: false }
  }
}
