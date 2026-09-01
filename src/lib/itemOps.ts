// ================================================
// src/lib/itemOps.ts — 借阅/归还/上下架 纯函数状态机（可单测的 seam）
// 用户体系：登录手机号区分发布者（物主）与借阅者
// ================================================

import type { Item } from './types'

/** 是否物主：登录手机号与发布者一致 */
export function isOwner(item: Item, phone: string | null | undefined): boolean {
  return !!phone && !!item.ownerPhone && item.ownerPhone === phone
}

/** 是否可借：在架、状态可借、已登录、且不是物主本人 */
export function canBorrow(item: Item, phone: string | null | undefined): boolean {
  return !item.archived && item.status === 'available' && !!phone && !isOwner(item, phone)
}

/** 借阅：状态 → 已借出，记录借阅人手机号与借出时间；返回新对象（入参不变） */
export function borrowItem(item: Item, phone: string): Item {
  return { ...item, status: 'lent', borrowedBy: phone, borrowedAt: new Date().toISOString() }
}

/** 是否可归还：已借出，且是借阅人本人 */
export function canReturn(item: Item, phone: string | null | undefined): boolean {
  return item.status === 'lent' && !!phone && !!item.borrowedBy && item.borrowedBy === phone
}

/** 归还：状态 → 可借，清空借阅人与借出时间；返回新对象（入参不变） */
export function returnItem(item: Item): Item {
  return { ...item, status: 'available', borrowedBy: undefined, borrowedAt: undefined }
}

/** 物主可下架/上架；已借出也可下架（从公开列表隐藏，不影响进行中的借用） */
export function canArchive(item: Item, phone: string | null | undefined): boolean {
  return isOwner(item, phone)
}

/** 物主可删除；已借出不可删，需先收回 */
export function canDelete(item: Item, phone: string | null | undefined): boolean {
  return isOwner(item, phone) && item.status !== 'lent'
}
