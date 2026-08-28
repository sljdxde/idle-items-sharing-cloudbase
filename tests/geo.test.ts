// ================================================
// tests/geo.test.ts — 距离计算与展示（haversine / formatDistance / matchesRadius）
// ================================================

import { describe, expect, it } from 'vitest'
import { distanceKm, formatDistance, itemLatLng } from '@/lib/geo'
import { matchesRadius } from '@/lib/filters'
import type { Item } from '@/lib/types'

const CENTER = { lat: 30.2745, lng: 120.14 }

function makeItem(lat: number | null, lng: number | null): Item {
  return {
    id: 1,
    name: '物品',
    desc: '',
    contactType: 'phone',
    contact: '13800000000',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000000',
    lat,
    lng,
    category: 'other',
    createTime: '2026-06-01T00:00:00Z',
  }
}

describe('distanceKm（haversine）', () => {
  it('同一点距离为 0', () => {
    expect(distanceKm(CENTER, CENTER)).toBeCloseTo(0, 9)
  })

  it('纬度差 1° ≈ 111km', () => {
    const d = distanceKm(CENTER, { lat: CENTER.lat + 1, lng: CENTER.lng })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })

  it('约 500m 北偏的物品距离约 0.5km', () => {
    const d = distanceKm(CENTER, { lat: CENTER.lat + 500 / 111000, lng: CENTER.lng })
    expect(d).toBeGreaterThan(0.48)
    expect(d).toBeLessThan(0.52)
  })
})

describe('formatDistance', () => {
  it('小于 1km 用米展示', () => {
    expect(formatDistance(0.3)).toBe('300m')
    expect(formatDistance(0.852)).toBe('852m')
  })
  it('大于等于 1km 保留一位小数', () => {
    expect(formatDistance(1)).toBe('1.0km')
    expect(formatDistance(3.26)).toBe('3.3km')
  })
  it('非法值返回「距离未知」', () => {
    expect(formatDistance(Number.NaN)).toBe('距离未知')
    expect(formatDistance(-1)).toBe('距离未知')
  })
})

describe('itemLatLng', () => {
  it('有定位返回坐标', () => {
    expect(itemLatLng(makeItem(30, 120))).toEqual({ lat: 30, lng: 120 })
  })
  it('无定位（null）返回 null', () => {
    expect(itemLatLng(makeItem(null, null))).toBeNull()
  })
})

describe('matchesRadius（距离筛选，x 为可配置半径）', () => {
  const near = makeItem(CENTER.lat + 300 / 111000, CENTER.lng) // ~300m
  const far = makeItem(CENTER.lat + 5 / 111, CENTER.lng) // ~5km
  const noPos = makeItem(null, null)

  it('半径内物品通过，半径外物品被过滤', () => {
    expect(matchesRadius(near, CENTER, 1)).toBe(true)
    expect(matchesRadius(far, CENTER, 1)).toBe(false)
    expect(matchesRadius(far, CENTER, 10)).toBe(true)
  })

  it('radius=all 或用户未定位时不限制', () => {
    expect(matchesRadius(far, CENTER, 'all')).toBe(true)
    expect(matchesRadius(far, null, 1)).toBe(true)
    expect(matchesRadius(noPos, null, 1)).toBe(true)
  })

  it('无定位物品不被距离筛选排除（显示「距离未知」而非隐藏）', () => {
    expect(matchesRadius(noPos, CENTER, 1)).toBe(true)
  })
})
