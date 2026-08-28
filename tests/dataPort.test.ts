// ================================================
// tests/dataPort.test.ts — 数据导出 / 导入（单机迁移通道）
// ================================================

import { describe, expect, it } from 'vitest'
import { exportFileName, exportItems, parseImportedItems } from '@/lib/dataPort'
import type { Item } from '@/lib/types'

const SAMPLE: Item[] = [
  {
    id: 1,
    name: '戴森V8吸尘器',
    desc: '九成新',
    contactType: 'phone',
    contact: '13800000001',
    imgUrl: '',
    status: 'lent',
    borrowedBy: '13900000002',
    borrowedAt: '2026-08-28T09:00:00.000Z',
    ownerPhone: '13800000001',
    lat: 30.2745,
    lng: 120.14,
    category: 'electronics',
    createTime: '2026-08-20T00:00:00.000Z',
  },
]

describe('exportItems / exportFileName', () => {
  it('导出为带元信息与 items 数组的 JSON', () => {
    const text = exportItems(SAMPLE)
    const parsed = JSON.parse(text)
    expect(parsed.app).toBe('linli-haowu')
    expect(parsed.version).toBe(1)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].name).toBe('戴森V8吸尘器')
  })

  it('导出文件名带时间戳', () => {
    const name = exportFileName(new Date('2026-08-28T09:05:00'))
    expect(name).toBe('linli-haowu-20260828-0905.json')
  })
})

describe('parseImportedItems', () => {
  it('回读导出文件（包装格式）', () => {
    const items = parseImportedItems(exportItems(SAMPLE))!
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 1,
      name: '戴森V8吸尘器',
      status: 'lent',
      borrowedBy: '13900000002',
      borrowedAt: '2026-08-28T09:00:00.000Z',
      lat: 30.2745,
      category: 'electronics',
    })
  })

  it('兼容裸数组格式', () => {
    const items = parseImportedItems(JSON.stringify(SAMPLE))!
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('戴森V8吸尘器')
  })

  it('容错：缺字段/未知分类/非法坐标被规范化，不抛异常', () => {
    const raw = [
      { id: 9, name: '杂项', category: 'nonsense', lat: 'bad', contactType: 'building' },
    ]
    const items = parseImportedItems(JSON.stringify(raw))!
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('other')
    expect(items[0].lat).toBeNull()
    expect(items[0].contactType).toBe('building')
    expect(items[0].status).toBe('available')
  })

  it('非法输入返回 null：非 JSON / 非数组 / 空数组 / 重复 id', () => {
    expect(parseImportedItems('{oops')).toBeNull()
    expect(parseImportedItems('{"foo": 1}')).toBeNull()
    expect(parseImportedItems('[]')).toBeNull()
    expect(parseImportedItems(JSON.stringify([{ id: 1, name: 'a' }, { id: 1, name: 'b' }]))).toBeNull()
    expect(parseImportedItems(JSON.stringify([{ name: '无id' }]))).toBeNull()
  })
})
