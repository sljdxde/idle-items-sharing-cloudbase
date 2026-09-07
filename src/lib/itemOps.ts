// ================================================
// src/lib/itemOps.ts — 借阅/归还/上下架 纯函数状态机（可单测的 seam）
// ADR-0005：用户体系改为手机号+PIN，物主/借阅人匹配用 phoneHash
// ================================================

import type { Item } from './types'
import { settleRent } from './rent'

/**
 * 是否物主（ADR-0005：phoneHash 比对）
 * @param item - 物品
 * @param phoneHash - 当前用户的 phoneHash（从 JWT 提取）
 */
export function isOwner(item: Item, phoneHash: string | null | undefined): boolean {
  return !!phoneHash && !!item.ownerHash && item.ownerHash === phoneHash
}

/** 是否可借：在架、状态可借、已登录、且不是物主本人 */
export function canBorrow(item: Item, phoneHash: string | null | undefined): boolean {
  return !item.archived && item.status === 'available' && !!phoneHash && !isOwner(item, phoneHash)
}

/** 借阅：状态 → 已借出，记录借阅人哈希与借出时间；返回新对象（入参不变） */
export function borrowItem(item: Item, phoneHash: string): Item {
  return {
    ...item,
    status: 'lent',
    borrowerHash: phoneHash,
    borrowedAt: new Date().toISOString(),
  }
}

/** 是否可归还：已借出，且是借阅人本人 */
export function canReturn(item: Item, phoneHash: string | null | undefined): boolean {
  if (item.status !== 'lent' || !phoneHash) return false
  return !!item.borrowerHash && item.borrowerHash === phoneHash
}

/** 归还：状态 → 可借，清空借阅人与借出时间，并追加一次租金结算记录；返回新对象（入参不变） */
export function returnItem(item: Item, now = new Date().toISOString()): Item {
  const next: Item = {
    ...item,
    status: 'available',
    borrowerHash: undefined,
    borrowedAt: undefined,
  }
  if (item.borrowedAt && item.rentType !== 'free') {
    next.rentRecords = [...(item.rentRecords ?? []), settleRent(item, item.borrowedAt, item.borrowerHash, now)]
  }
  return next
}

/** 物主可下架/上架；已借出也可下架（从公开列表隐藏，不影响进行中的借用） */
export function canArchive(item: Item, phoneHash: string | null | undefined): boolean {
  return isOwner(item, phoneHash)
}

/** 物主可删除；已借出不可删，需先收回 */
export function canDelete(item: Item, phoneHash: string | null | undefined): boolean {
  return isOwner(item, phoneHash) && item.status !== 'lent'
}
