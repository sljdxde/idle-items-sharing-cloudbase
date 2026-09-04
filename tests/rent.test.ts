// ================================================
// tests/rent.test.ts — 租金计费纯函数回归（准确性）
// 覆盖：按天向上取整 / 免费·按次·按天金额 / 结算记录 / 文案 / 累计
// ================================================

import { describe, expect, it } from 'vitest'
import {
  normalizeRentFee,
  normalizeRentType,
  rentAmount,
  rentBorrowHint,
  rentDays,
  rentLabel,
  settleRent,
  totalRent,
} from '@/lib/rent'

describe('normalizeRentType / normalizeRentFee（容错）', () => {
  it('非法/未知类型归入免费', () => {
    expect(normalizeRentType('daily')).toBe('daily')
    expect(normalizeRentType('perUse')).toBe('perUse')
    expect(normalizeRentType('free')).toBe('free')
    expect(normalizeRentType('weekly')).toBe('free')
    expect(normalizeRentType(undefined)).toBe('free')
    expect(normalizeRentType(null)).toBe('free')
  })
  it('金额：非法/负数归 0', () => {
    expect(normalizeRentFee(5)).toBe(5)
    expect(normalizeRentFee('3.5')).toBe(3.5)
    expect(normalizeRentFee(-1)).toBe(0)
    expect(normalizeRentFee('abc')).toBe(0)
    expect(normalizeRentFee(undefined)).toBe(0)
  })
})

describe('rentDays：按天向上取整，不足 1 天按 1 天', () => {
  it('同刻借还按 1 天（借用即至少计 1 天）', () => {
    expect(rentDays('2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z')).toBe(1)
  })
  it('不足 1 天（5 小时）按 1 天', () => {
    expect(rentDays('2026-09-01T10:00:00Z', '2026-09-01T15:00:00Z')).toBe(1)
  })
  it('1 天零 2 小时按 2 天（向上取整）', () => {
    expect(rentDays('2026-09-01T10:00:00Z', '2026-09-02T12:00:00Z')).toBe(2)
  })
  it('整 3 天按 3 天', () => {
    expect(rentDays('2026-09-01T10:00:00Z', '2026-09-04T10:00:00Z')).toBe(3)
  })
  it('非法时间返回 0', () => {
    expect(rentDays('bad', '2026-09-04T10:00:00Z')).toBe(0)
    expect(rentDays('2026-09-01T10:00:00Z', 'bad')).toBe(0)
  })
})

describe('rentAmount：金额计算', () => {
  it('免费恒为 0，与借期无关', () => {
    expect(rentAmount('free', 0, '2026-09-01T10:00:00Z', '2026-09-03T10:00:00Z')).toBe(0)
  })
  it('按次：固定金额，与借期长短无关', () => {
    expect(rentAmount('perUse', 5, '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z')).toBe(5)
    expect(rentAmount('perUse', 5, '2026-09-01T10:00:00Z', '2026-09-05T10:00:00Z')).toBe(5)
  })
  it('按天：天数 × 单价', () => {
    expect(rentAmount('daily', 2, '2026-09-01T10:00:00Z', '2026-09-02T12:00:00Z')).toBe(4)
    expect(rentAmount('daily', 3.5, '2026-09-01T10:00:00Z', '2026-09-04T10:00:00Z')).toBe(10.5)
  })
})

describe('settleRent：一次归还的结算记录', () => {
  it('daily 记录天数与金额', () => {
    const rec = settleRent(
      { rentType: 'daily', rentFee: 2 },
      '2026-09-01T10:00:00Z',
      '13900000001',
      '2026-09-02T12:00:00Z',
    )
    expect(rec.days).toBe(2)
    expect(rec.fee).toBe(4)
    expect(rec.borrower).toBe('13900000001')
    expect(rec.borrowedAt).toBe('2026-09-01T10:00:00Z')
    expect(rec.returnedAt).toBe('2026-09-02T12:00:00Z')
  })
  it('perUse 无天数，金额为单价', () => {
    const rec = settleRent(
      { rentType: 'perUse', rentFee: 5 },
      '2026-09-01T10:00:00Z',
      '13900000001',
      '2026-09-03T10:00:00Z',
    )
    expect(rec.days).toBeUndefined()
    expect(rec.fee).toBe(5)
  })
  it('free 金额 0 且无天数', () => {
    const rec = settleRent(
      { rentType: 'free', rentFee: 0 },
      '2026-09-01T10:00:00Z',
      '13900000001',
      '2026-09-03T10:00:00Z',
    )
    expect(rec.fee).toBe(0)
    expect(rec.days).toBeUndefined()
  })
})

describe('rentLabel / rentBorrowHint（展示文案）', () => {
  it('租金文案', () => {
    expect(rentLabel({ rentType: 'free', rentFee: 0 })).toBe('免费')
    expect(rentLabel({ rentType: 'daily', rentFee: 2 })).toBe('¥2/天')
    expect(rentLabel({ rentType: 'perUse', rentFee: 5 })).toBe('¥5/次')
  })
  it('借用说明：收费时明示向上取整规则，免费无', () => {
    expect(rentBorrowHint({ rentType: 'free', rentFee: 0 })).toBeNull()
    expect(rentBorrowHint({ rentType: 'daily', rentFee: 2 })).toContain('¥2/天')
    expect(rentBorrowHint({ rentType: 'daily', rentFee: 2 })).toContain('向上取整')
    expect(rentBorrowHint({ rentType: 'perUse', rentFee: 5 })).toContain('按次计费')
    expect(rentBorrowHint({ rentType: 'perUse', rentFee: 5 })).toContain('¥5/次')
  })
})

describe('totalRent：累计收入', () => {
  it('累加所有记录金额', () => {
    expect(
      totalRent([
        { borrowedAt: 'a', returnedAt: 'b', fee: 4 },
        { borrowedAt: 'c', returnedAt: 'd', fee: 5 },
      ]),
    ).toBe(9)
  })
  it('空 / 非法输入返回 0', () => {
    expect(totalRent(undefined)).toBe(0)
    expect(totalRent([])).toBe(0)
    expect(totalRent([{ borrowedAt: 'a', returnedAt: 'b', fee: Number.NaN }])).toBe(0)
  })
})
