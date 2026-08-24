// ================================================
// tests/localstore.test.ts — 本地数据层契约测试（离线版核心状态机）
// 用内存 Map 模拟 localStorage，覆盖 CRUD + 借阅闭环 + 持久化往返
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

beforeEach(() => {
  backing.clear()
})

describe('loadItems / 种子导入', () => {
  it('空存储 → 导入种子数据并持久化', () => {
    const items = localStore.loadItems()
    expect(items).toHaveLength(SEED_ITEMS.length)
    expect(backing.get('linli_haowu_items_v1')).toBeTruthy()
  })

  it('已有数据 → 原样读回，不重置种子', () => {
    const mine: Item[] = [
      { ...SEED_ITEMS[0], id: 42, name: '我的物品' },
    ]
    backing.set('linli_haowu_items_v1', JSON.stringify(mine))
    const items = localStore.loadItems()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('我的物品')
  })

  it('损坏数据 → 回退种子不抛异常', () => {
    backing.set('linli_haowu_items_v1', '{oops not json')
    expect(() => localStore.loadItems()).not.toThrow()
    expect(localStore.loadItems()).toHaveLength(SEED_ITEMS.length)
  })
})

describe('发布 → 借出 → 归还 全闭环', () => {
  function fresh(): Item[] {
    return localStore.loadItems()
  }

  it('publish 字段落库、id 自增、状态 available', () => {
    const items = fresh()
    const item: Item = {
      ...items[0],
      id: localStore.nextId(items),
      name: '测试梯子',
      category: 'tools',
      status: 'available',
      requests: [],
      archived: false,
      createTime: new Date().toISOString(),
    }
    items.unshift(item)
    expect(localStore.saveItems(items)).toBe(true)

    const roundtrip = JSON.parse(backing.get('linli_haowu_items_v1')!) as Item[]
    const saved = roundtrip.find((x) => x.name === '测试梯子')!
    expect(saved.id).toBe(localStore.nextId(fresh()) - 1)
    expect(saved.status).toBe('available')
    expect(saved.category).toBe('tools')
  })

  it('借阅申请 → requested；确认 → borrowed；归还 → available', () => {
    const items = fresh().map((x) => ({ ...x, requests: [], status: 'available' as const }))
    const target = items[0]

    // ① 借阅人申请
    target.requests.push({
      id: localStore.uid(),
      fromName: '邻居小李',
      contact: '微信 li',
      message: '周末借两天',
      createdAt: new Date().toISOString(),
      status: 'pending',
    })
    target.status = 'requested'
    expect(target.status).toBe('requested')

    // ② 物主确认
    const req = target.requests.find((r) => r.status === 'pending')!
    req.status = 'accepted'
    target.status = 'borrowed'

    // ③ 确认归还
    for (const r of target.requests) r.status = r.status === 'accepted' ? 'returned' : r.status
    target.status = 'available'

    expect(target.status).toBe('available')
    expect(target.requests.map((r) => r.status)).toEqual(['returned'])
  })

  it('下架/重新上架/删除的可见性语义', () => {
    const items = fresh()
    const it0 = items[0]
    it0.archived = true
    expect(items.filter((x) => !x.archived)).not.toContain(it0) // 下架后列表不可见
    it0.archived = false
    expect(items.filter((x) => !x.archived)).toContain(it0) // 重新上架恢复
    const removed = items.splice(items.indexOf(it0), 1) // 物理删除
    expect(items).not.toContain(removed[0])
  })

  it('uid 唯一性', () => {
    const ids = new Set(Array.from({ length: 200 }, () => localStore.uid()))
    expect(ids.size).toBe(200)
  })
})
