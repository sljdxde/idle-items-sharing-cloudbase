// ================================================
// src/lib/rent.ts — 租金计费纯函数（可单测的 seam）
// 计费方式：free=免费 / daily=按天 / perUse=按次
// 按天规则：借期按天向上取整，不足 1 天按 1 天（借用即至少计 1 天）
// ================================================

import type { Item, RentRecord, RentType } from './types'

const DAY_MS = 86400000

/** 解析为合法 RentType；非法输入归入免费 */
export function normalizeRentType(v: unknown): RentType {
  return v === 'daily' || v === 'perUse' ? v : 'free'
}

/** 解析为合法非负金额；非法输入归 0 */
export function normalizeRentFee(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** 借期天数（按天向上取整，不足 1 天按 1 天）；时间非法返回 0 */
export function rentDays(borrowedAt: string, returnedAt: string): number {
  const start = new Date(borrowedAt).getTime()
  const end = new Date(returnedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  const ms = Math.max(end - start, 0)
  return Math.max(1, Math.ceil(ms / DAY_MS))
}

/** 单次借用的结算金额（元） */
export function rentAmount(
  rentType: RentType,
  rentFee: number,
  borrowedAt: string,
  returnedAt: string,
): number {
  if (rentType === 'free') return 0
  if (rentType === 'perUse') return rentFee
  return rentDays(borrowedAt, returnedAt) * rentFee
}

/** 为一次归还生成结算记录（追加到 item.rentRecords 用） */
export function settleRent(
  item: Pick<Item, 'rentType' | 'rentFee'>,
  borrowedAt: string,
  borrower: string | undefined,
  returnedAt: string,
): RentRecord {
  const rentType = normalizeRentType(item.rentType)
  const fee = rentAmount(rentType, normalizeRentFee(item.rentFee), borrowedAt, returnedAt)
  return {
    borrowedAt,
    returnedAt,
    days: rentType === 'daily' ? rentDays(borrowedAt, returnedAt) : undefined,
    fee,
    borrower,
  }
}

/** 展示用租金文案：免费 / ¥x/天 / ¥x/次 */
export function rentLabel(item: Pick<Item, 'rentType' | 'rentFee'>): string {
  const t = normalizeRentType(item.rentType)
  const fee = normalizeRentFee(item.rentFee)
  if (t === 'free') return '免费'
  return `¥${fee}${t === 'daily' ? '/天' : '/次'}`
}

/** 借用说明文案（借阅弹窗明示，避免误会） */
export function rentBorrowHint(item: Pick<Item, 'rentType' | 'rentFee'>): string | null {
  const t = normalizeRentType(item.rentType)
  const fee = normalizeRentFee(item.rentFee)
  if (t === 'free') return null
  if (t === 'daily') {
    return `本物品按天计费 ¥${fee}/天：借期按天向上取整，不足 1 天按 1 天计算，归还时结算。`
  }
  return `本物品按次计费 ¥${fee}/次，归还时结算。`
}

/** 累计租金收入（历史所有结算记录之和） */
export function totalRent(records: RentRecord[] | undefined): number {
  if (!records || records.length === 0) return 0
  return records.reduce((sum, r) => sum + (Number.isFinite(r.fee) ? r.fee : 0), 0)
}
