// ================================================
// src/lib/itemOps.ts — 借阅/归还/上下架 纯函数状态机（可单测的 seam）
// 用户体系：以登录手机号区分发布者（物主）与借阅者
// ================================================

import type { Item } from './types'

/** 是否物主：登录手机号与发布者手机号一致 */
export function isOwner(item: Item, phone: string | null | undefined): boolean {
  return !!phone && item.ownerPhone === phone
}

/** 是否可借：在架、状态可借、已登录、且不是物主本人 */
export function canBorrow(item: Item, phone: string | null | undefined): boolean {
  return (
    !item.archived &&
    item.status === 'available' &&
    !!phone &&
    item.ownerPhone !== phone
  )
}

/** 借阅：状态 → 已借出，记录借阅人手机号与借出时间；返回新对象（入参不变） */
export function borrowItem(item: Item, phone: string): Item {
  return { ...item, status: 'lent', borrowedBy: phone, borrowedAt: new Date().toISOString() }
}

/** 是否可归还：已借出且当前用户就是借阅人 */
export function canReturn(item: Item, phone: string | null | undefined): boolean {
  return item.status === 'lent' && !!phone && item.borrowedBy === phone
}

/** 归还：状态 → 可借，清空借阅人与借出时间；返回新对象（入参不变） */
export function returnItem(item: Item): Item {
  return { ...item, status: 'available', borrowedBy: undefined, borrowedAt: undefined }
}
