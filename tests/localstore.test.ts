// ================================================
// tests/localstore.test.ts — 本地数据层契约测试（v2：定位 / 手机号用户体系）
// 用内存 Map 模拟 localStorage，覆盖种子导入 / 持久化往返 / id 自增
// ================================================

import { beforeEach, describe, expect, it } from 'vitest'
import * as localStore from '@/lib/localStore'
import { SEED_ITEMS } from '@/lib/seed'
import type { Item } from '@/lib/types'

// ---- localStorage stub ----
const backing = new Map<string, string>()
const storageStub = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
}
Object.defineProperty(globalThis, 'localStorage', {
  value: storageStub,
  configurable: true,
  writable: true,
})

const KEY = 'linli_haowu_items_v2'

beforeEach(() => {
  backing.clear()
})

describe('loadItems / 种子导入', () => {
  it('空存储 → 导入种子数据并持久化', () => {
    const items = localStore.loadItems()
    expect(items).toHaveLength(SEED_ITEMS.length)
    expect(backing.get(KEY)).toBeTruthy()
  })

  it('种子数据符合 v2 契约：含 ownerPhone / 定位 / 联系方式类型', () => {
    const items = localStore.loadItems()
    for (const it of items) {
      expect(typeof it.ownerPhone).toBe('string')
      expect(['phone', 'building']).toContain(it.contactType)
      expect(['available', 'lent']).toContain(it.status)
      // 定位可空，但字段必须存在
      expect(it).toHaveProperty('lat')
      expect(it).toHaveProperty('lng')
    }
    // 至少一件已借出物品（演示「默认隐藏已借出」筛选）
    expect(items.some((x) => x.status === 'lent' && x.borrowedBy)).toBe(true)
    // 至少一件带定位（演示距离筛选）
    expect(items.some((x) => typeof x.lat === 'number')).toBe(true)
  })

  it('已有数据 → 原样读回，不重置种子', () => {
    const mine: Item[] = [
      { ...SEED_ITEMS[0]!, id: 42, name: '我的物品' },
    ]
    backing.set(KEY, JSON.stringify(mine))
    const items = localStore.loadItems()
    expect(items).toHaveLength(1)
    expect(items[0]!.name).toBe('我的物品')
  })

  it('损坏数据 → 回退种子不抛异常', () => {
    backing.set(KEY, '{oops not json')
    expect(() => localStore.loadItems()).not.toThrow()
    expect(localStore.loadItems()).toHaveLength(SEED_ITEMS.length)
  })
})

describe('发布落库（publish 字段 + id 自增 + 持久化往返）', () => {
  it('新物品入库后可从 localStorage 完整读回', () => {
    const items = localStore.loadItems()
    const item: Item = {
      id: localStore.nextId(items),
      name: '测试梯子',
      desc: '两米铝合金',
      contactType: 'building',
      contact: '6栋301',
      imgUrl: '',
      status: 'available',
      ownerPhone: '13812345678',
      lat: 30.2745,
      lng: 120.14,
      category: 'tools',
      createTime: new Date().toISOString(),
    }
    items.unshift(item)
    expect(localStore.saveItems(items)).toBe(true)

    const roundtrip = JSON.parse(backing.get(KEY)!) as Item[]
    const saved = roundtrip.find((x) => x.name === '测试梯子')!
    expect(saved.id).toBe(item.id)
    expect(saved.status).toBe('available')
    expect(saved.ownerPhone).toBe('13812345678')
    expect(saved.contactType).toBe('building')
    expect(saved.lat).toBeCloseTo(30.2745, 6)
    expect(saved.lng).toBeCloseTo(120.14, 6)
  })

  it('nextId 在空数组时从 1 开始', () => {
    expect(localStore.nextId([])).toBe(1)
  })
})

describe('resetItems', () => {
  it('清空后重新导入种子', () => {
    const items = localStore.loadItems()
    items.splice(0, items.length)
    localStore.saveItems(items)
    localStore.resetItems()
    expect(backing.has(KEY)).toBe(false)
    expect(localStore.loadItems()).toHaveLength(SEED_ITEMS.length)
  })
})
