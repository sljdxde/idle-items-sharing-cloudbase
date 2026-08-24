// ================================================
// tests/filters.test.ts — 纯函数筛选器单测
// 覆盖：分类 / 搜索 / 距离 / 排序 / 分类推断
// ================================================

import { describe, expect, it } from 'vitest'
import {
  calcDistance,
  filterItems,
  formatDateShort,
  formatDistance,
  matchesCategory,
  matchesSearch,
  sortItems,
  withinRange,
} from '@/lib/filters'
import { inferCategory, normalizeCategory } from '@/lib/categories'
import type { Item } from '@/lib/types'

function makeItem(partial: Partial<Item>): Item {
  return {
    id: 1,
    name: '物品',
    desc: '',
    contact: '',
    building: '',
    lat: null,
    lng: null,
    imgUrl: '',
    status: 'available',
    requests: [],
    category: 'other',
    createTime: '2026-06-01T00:00:00Z',
    ...partial,
  }
}

describe('calcDistance / formatDistance', () => {
  it('同一点距离为 0', () => {
    expect(calcDistance(30, 120, 30, 120)).toBe(0)
  })

  it('500 米格式化为米，1500 米格式化为千米', () => {
    expect(formatDistance(500)).toBe('500m')
    expect(formatDistance(1500)).toBe('1.5km')
  })
})

describe('matchesCategory', () => {
  it('all 放行一切', () => {
    const item = makeItem({ category: 'books' })
    expect(matchesCategory(item, 'all')).toBe(true)
  })

  it('按分类过滤；旧数据空分类归入 other', () => {
    const legacy = makeItem({ category: '' as Item['category'] })
    expect(matchesCategory(legacy, 'other')).toBe(true)
    expect(matchesCategory(makeItem({ category: 'tools' }), 'home')).toBe(false)
  })
})

describe('matchesSearch', () => {
  const item = makeItem({ name: '戴森吸尘器', desc: '九成新', building: '3栋1801' })

  it('命中名称', () => {
    expect(matchesSearch(item, '戴森')).toBe(true)
  })
  it('命中描述与楼号', () => {
    expect(matchesSearch(item, '九成')).toBe(true)
    expect(matchesSearch(item, '1801')).toBe(true)
  })
  it('未命中返回 false，空查询放行', () => {
    expect(matchesSearch(item, '不存在的词')).toBe(false)
    expect(matchesSearch(item, '')).toBe(true)
    expect(matchesSearch(item, '   ')).toBe(true)
  })
})

describe('withinRange', () => {
  const user = { lat: 30, lng: 120 }

  it('range<=0 不限距离', () => {
    expect(withinRange(makeItem({ lat: 40, lng: 121 }), user, 0)).toBe(true)
  })
  it('未定位或物品缺坐标时不过滤', () => {
    expect(withinRange(makeItem({}), user, 1000)).toBe(true)
    expect(withinRange(makeItem({ lat: 40, lng: 121 }), null, 1000)).toBe(true)
  })
})

describe('sortItems / filterItems', () => {
  it('未定位按发布时间降序', () => {
    const items = [
      makeItem({ id: 1, createTime: '2026-06-01T00:00:00Z' }),
      makeItem({ id: 2, createTime: '2026-06-10T00:00:00Z' }),
    ]
    expect(sortItems(items, null).map((x) => x.id)).toEqual([2, 1])
  })

  it('已定位按距离升序、缺坐标沉底', () => {
    const user = { lat: 30, lng: 120 }
    const near = makeItem({ id: 1, lat: 30.001, lng: 120 })
    const far = makeItem({ id: 2, lat: 30.05, lng: 120 })
    const noGeo = makeItem({ id: 3 })
    expect(sortItems([noGeo, far, near], user).map((x) => x.id)).toEqual([1, 2, 3])
  })

  it('filterItems 组合：分类 + 搜索 + 距离', () => {
    const user = { lat: 30, lng: 120 }
    const keep = makeItem({
      id: 1,
      name: '儿童滑板车',
      category: 'kids',
      lat: 30.001,
      lng: 120,
    })
    const wrongCat = makeItem({ id: 2, name: '滑板车', category: 'outdoor' })
    const outOfRange = makeItem({
      id: 3,
      name: '儿童玩具',
      category: 'kids',
      lat: 31,
      lng: 120,
    })
    const result = filterItems([keep, wrongCat, outOfRange], {
      category: 'kids',
      search: '滑板车',
      rangeMeters: 1000,
      user,
    })
    expect(result.map((x) => x.id)).toEqual([1])
  })
})

describe('categories', () => {
  it('inferCategory 关键词推断', () => {
    expect(inferCategory('戴森V8吸尘器', '九成新')).toBe('electronics')
    expect(inferCategory('露营四人间帐篷', '')).toBe('outdoor')
    expect(inferCategory('电钻+全套钻头', '')).toBe('tools')
    expect(inferCategory('英文原版绘本30册', '适合3-6岁')).toBe('books')
    expect(inferCategory('神秘物品', '说不清')).toBe('other')
  })

  it('normalizeCategory 宽松归一', () => {
    expect(normalizeCategory('')).toBe('other')
    expect(normalizeCategory(null)).toBe('other')
    expect(normalizeCategory('nonsense')).toBe('other')
    expect(normalizeCategory('books')).toBe('books')
  })
})

describe('formatDateShort', () => {
  it('合法 ISO 输出「M月D日」', () => {
    expect(formatDateShort('2026-06-12T08:00:00Z')).toMatch(/6月12日/)
  })
  it('非法输入回退「刚刚」', () => {
    expect(formatDateShort('')).toBe('刚刚')
    expect(formatDateShort('not-a-date')).toBe('刚刚')
  })
})
