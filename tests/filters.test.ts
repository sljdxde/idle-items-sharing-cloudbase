// ================================================
// tests/filters.test.ts — 纯函数筛选器单测
// 分类 / 搜索 / 最新排序 / 分类推断（距离筛选见 geo.test.ts）
// ================================================

import { describe, expect, it } from 'vitest'
import {
  filterItems,
  formatDateShort,
  matchesCategory,
  matchesSearch,
  sortByNewest,
} from '@/lib/filters'
import { inferCategory, normalizeCategory } from '@/lib/categories'
import type { Item } from '@/lib/types'

function makeItem(partial: Partial<Item>): Item {
  return {
    id: 1,
    name: '物品',
    desc: '',
    contactType: 'phone',
    contact: '',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000000',
    lat: null,
    lng: null,
    category: 'other',
    createTime: '2026-06-01T00:00:00Z',
    ...partial,
  }
}

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
  const item = makeItem({ name: '戴森吸尘器', desc: '九成新', contactType: 'building', contact: '3栋1801' })

  it('命中名称', () => {
    expect(matchesSearch(item, '戴森')).toBe(true)
  })
  it('命中描述与楼号（联系方式为楼号时纳入搜索）', () => {
    expect(matchesSearch(item, '九成')).toBe(true)
    expect(matchesSearch(item, '1801')).toBe(true)
  })
  it('未命中返回 false，空查询放行', () => {
    expect(matchesSearch(item, '不存在的词')).toBe(false)
    expect(matchesSearch(item, '')).toBe(true)
    expect(matchesSearch(item, '   ')).toBe(true)
  })
})

describe('sortByNewest / filterItems', () => {
  it('最新优先；时间相同时 id 降序', () => {
    const items = [
      makeItem({ id: 1, createTime: '2026-06-10T00:00:00Z' }),
      makeItem({ id: 2, createTime: '2026-06-01T00:00:00Z' }),
      makeItem({ id: 3, createTime: '2026-06-01T00:00:00Z' }),
    ]
    expect(sortByNewest(items).map((x) => x.id)).toEqual([1, 3, 2])
  })

  it('不改动入参数组', () => {
    const items = [makeItem({ id: 1 }), makeItem({ id: 2, createTime: '2026-07-01T00:00:00Z' })]
    sortByNewest(items)
    expect(items.map((x) => x.id)).toEqual([1, 2])
  })

  it('filterItems 组合：分类 + 搜索 + 排序', () => {
    const keep = makeItem({
      id: 1,
      name: '儿童滑板车',
      category: 'kids',
      createTime: '2026-06-05T00:00:00Z',
    })
    const wrongCat = makeItem({ id: 2, name: '滑板车', category: 'outdoor' })
    const wrongWord = makeItem({ id: 3, name: '儿童玩具', category: 'kids' })
    const result = filterItems([keep, wrongCat, wrongWord], {
      category: 'kids',
      search: '滑板车',
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
