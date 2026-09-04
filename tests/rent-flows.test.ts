// ================================================
// tests/rent-flows.test.ts — 租金流程回归
// 模拟同一件物品反复「借出 → 归还」，覆盖 免费 / 按次 / 按天 / 修改租金
// 验证结算记录与累计收入的准确性（与 itemOps.returnItem 乐观结算一致）
// ================================================

import { describe, expect, it } from 'vitest'
import { returnItem } from '@/lib/itemOps'
import { totalRent } from '@/lib/rent'
import type { Item } from '@/lib/types'

function makeCharged(partial: Partial<Item>): Item {
  return {
    id: 1,
    name: '测试物品',
    desc: '',
    contactType: 'phone',
    contact: '',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000000',
    lat: null,
    lng: null,
    category: 'tools',
    createTime: '2026-09-01T00:00:00Z',
    rentType: 'free',
    rentFee: 0,
    ...partial,
  }
}

/**
 * 模拟一次完整「借出 → 归还」：
 * 固定借出时间，returnItem 按借出/归还时间结算租金（与 worker 一致）
 */
function cycle(item: Item, borrower: string, borrowAt: string, returnAt: string): Item {
  const lent: Item = { ...item, status: 'lent', borrowedBy: borrower, borrowedAt: borrowAt }
  return returnItem(lent, returnAt)
}

describe('租金流程回归：同一物品反复借出/归还', () => {
  it('免费：反复借还不产生结算记录，累计 0', () => {
    let it = makeCharged({ rentType: 'free', rentFee: 0 })
    it = cycle(it, '13900000001', '2026-09-01T10:00:00Z', '2026-09-03T12:00:00Z')
    it = cycle(it, '13900000002', '2026-09-05T10:00:00Z', '2026-09-06T10:00:00Z')
    it = cycle(it, '13900000003', '2026-09-08T10:00:00Z', '2026-09-09T10:00:00Z')
    expect(it.rentRecords ?? []).toHaveLength(0)
    expect(totalRent(it.rentRecords)).toBe(0)
  })

  it('按次 ¥5：借还两次各收 5，累计 10', () => {
    let it = makeCharged({ rentType: 'perUse', rentFee: 5 })
    // 第 1 次：借 2 天多，按次仍收 5
    it = cycle(it, '13900000001', '2026-09-01T10:00:00Z', '2026-09-03T12:00:00Z')
    expect(it.rentRecords).toHaveLength(1)
    expect(it.rentRecords![0].fee).toBe(5)
    expect(it.rentRecords![0].days).toBeUndefined()
    // 第 2 次：借 1 小时，仍收 5
    it = cycle(it, '13900000002', '2026-09-05T10:00:00Z', '2026-09-05T11:00:00Z')
    expect(it.rentRecords).toHaveLength(2)
    expect(it.rentRecords![1].fee).toBe(5)
    expect(totalRent(it.rentRecords)).toBe(10)
  })

  it('按天 ¥2：不足 1 天按 1 天、1 天 2 小时按 2 天；累计 2+4=6', () => {
    let it = makeCharged({ rentType: 'daily', rentFee: 2 })
    // 第 1 次：5 小时 → 1 天 → ¥2
    it = cycle(it, '13900000001', '2026-09-01T10:00:00Z', '2026-09-01T15:00:00Z')
    expect(it.rentRecords![0]).toMatchObject({ days: 1, fee: 2 })
    // 第 2 次：1 天零 2 小时 → 2 天 → ¥4
    it = cycle(it, '13900000002', '2026-09-05T10:00:00Z', '2026-09-06T12:00:00Z')
    expect(it.rentRecords![1]).toMatchObject({ days: 2, fee: 4 })
    expect(totalRent(it.rentRecords)).toBe(6)
  })

  it('修改租金类型：按次→按天，旧记录保留、新借用按新方式结算', () => {
    // 起始：按次 ¥5
    let it = makeCharged({ rentType: 'perUse', rentFee: 5 })
    it = cycle(it, '13900000001', '2026-09-01T10:00:00Z', '2026-09-02T10:00:00Z')
    expect(it.rentRecords![0].fee).toBe(5)
    // 修改为按天 ¥3（rentRecords 保留历史）
    it = { ...it, rentType: 'daily', rentFee: 3 }
    it = cycle(it, '13900000002', '2026-09-05T10:00:00Z', '2026-09-06T10:00:00Z')
    expect(it.rentRecords).toHaveLength(2)
    expect(it.rentRecords![1]).toMatchObject({ days: 1, fee: 3 })
    expect(totalRent(it.rentRecords)).toBe(5 + 3)
  })

  it('修改租金金额：按天单价 2→5，旧借用按旧价、新借用按新价', () => {
    let it = makeCharged({ rentType: 'daily', rentFee: 2 })
    // 旧价：2 天 × 2 = 4
    it = cycle(it, '13900000001', '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z')
    expect(it.rentRecords![0].fee).toBe(4)
    // 改单价为 5（rentRecords 保留历史）
    it = { ...it, rentFee: 5 }
    // 新价：1 天 × 5 = 5
    it = cycle(it, '13900000002', '2026-09-05T10:00:00Z', '2026-09-06T10:00:00Z')
    expect(it.rentRecords![1]).toMatchObject({ days: 1, fee: 5 })
    expect(totalRent(it.rentRecords)).toBe(4 + 5)
  })

  it('混合计费：同一物品历经 免费→按次→按天，累计准确', () => {
    let it = makeCharged({ rentType: 'free', rentFee: 0 })
    // 免费期借还：不产生记录
    it = cycle(it, '13900000001', '2026-09-01T10:00:00Z', '2026-09-02T10:00:00Z')
    expect(it.rentRecords ?? []).toHaveLength(0)
    // 改为按次 ¥8
    it = { ...it, rentType: 'perUse', rentFee: 8 }
    it = cycle(it, '13900000002', '2026-09-04T10:00:00Z', '2026-09-05T10:00:00Z')
    expect(it.rentRecords![0].fee).toBe(8)
    // 改为按天 ¥3
    it = { ...it, rentType: 'daily', rentFee: 3 }
    it = cycle(it, '13900000003', '2026-09-07T10:00:00Z', '2026-09-09T12:00:00Z') // 2 天 2 小时 → 3 天
    expect(it.rentRecords![1]).toMatchObject({ days: 3, fee: 9 })
    // 累计 = 8 + 9 = 17
    expect(totalRent(it.rentRecords)).toBe(17)
  })
})
