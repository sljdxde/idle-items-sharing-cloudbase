// ================================================
// src/lib/geocode.ts — 逆地理编码（坐标 → 人类可读地点）
// 用 OpenStreetMap Nominatim（免费、无需 key）把物品定位解析成
// 「小区 / 街道 / 区县」短文案，展示在详情页。纯函数标签逻辑可单测。
// ================================================

import type { LatLng } from './geo'

/** Nominatim address 字段里可能出现的地点层级（取值均为 string） */
export interface NominatimAddress {
  residential?: string
  neighbourhood?: string
  suburb?: string
  hamlet?: string
  village?: string
  town?: string
  city?: string
  city_district?: string
  county?: string
  state?: string
  road?: string
  [k: string]: string | undefined
}

export interface NominatimReverse {
  display_name?: string
  address?: NominatimAddress
}

function pick(addr: NominatimAddress, keys: string[]): string {
  for (const k of keys) {
    const v = addr[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * 从 Nominatim 反解结果构造短文案：
 * - 优先最贴近生活的层级（小区/邻里/街道），拼上区县或城市做参照；
 * - 没有细化层级时退回 display_name 首段；解析不出返回空串。
 */
export function buildAddressLabel(data: NominatimReverse | null): string {
  if (!data) return ''
  const addr = data.address ?? {}

  const local = pick(addr, ['residential', 'neighbourhood', 'suburb', 'hamlet', 'village', 'road'])
  const area = pick(addr, ['city_district', 'county', 'town', 'city'])

  if (local && area && local !== area) return `${local} · ${area}`
  if (local) return local
  if (area) return area

  const first = (data.display_name ?? '').split(',')[0]?.trim()
  return first ?? ''
}

const GEO_TIMEOUT_MS = 8000
/** localStorage 缓存：坐标按约 100m 网格归一，避免重复请求 Nominatim */
const GEO_CACHE_PREFIX = 'linli_haowu_geo_v1:'

function cacheKey(p: LatLng): string {
  // 3 位小数 ≈ 111m 精度，足够邻里场景复用
  return GEO_CACHE_PREFIX + p.lat.toFixed(3) + ',' + p.lng.toFixed(3)
}

function readCache(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeCache(key: string, label: string): void {
  try {
    localStorage.setItem(key, label)
  } catch {
    /* 隐私模式/满额：忽略 */
  }
}

/**
 * 坐标 → 地点短文案。任何失败（网络/超时/无结果）都返回空串，绝不抛错，
 * 由调用方决定是否展示降级内容。
 */
export async function reverseGeocode(p: LatLng): Promise<string> {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return ''

  const key = cacheKey(p)
  const hit = readCache(key)
  if (hit !== null) return hit

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), GEO_TIMEOUT_MS)
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2' +
      `&lat=${encodeURIComponent(p.lat)}&lon=${encodeURIComponent(p.lng)}` +
      '&zoom=18&addressdetails=1&accept-language=zh-CN'
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!res.ok) return ''
    const data = (await res.json().catch(() => null)) as NominatimReverse | null
    const label = buildAddressLabel(data)
    writeCache(key, label)
    return label
  } catch {
    return ''
  }
}
