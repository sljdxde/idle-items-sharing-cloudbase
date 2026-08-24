// ================================================
// src/lib/types.ts — 领域类型（前后端共享契约）
// 对应 CONTEXT.md：Item / BorrowRequest / 状态机
// ================================================

export type ItemStatus = 'available' | 'requested' | 'borrowed'

export type BorrowRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'returned'

export interface BorrowRequest {
  id: string
  fromName: string
  contact: string
  message: string
  createdAt: string
  status: BorrowRequestStatus
}

/** 分类 id，与 src/lib/categories.ts 的 CATEGORIES 对应；空串/未知值归入 other */
export type CategoryId =
  | 'home'
  | 'electronics'
  | 'kids'
  | 'outdoor'
  | 'tools'
  | 'books'
  | 'clothing'
  | 'other'

export interface Item {
  /** 本地自增编号 */
  id: number
  name: string
  desc: string
  contact: string
  building: string
  /** 图片为包内 data:URI（canvas 压缩后），离线可用 */
  imgUrl: string
  status: ItemStatus
  requests: BorrowRequest[]
  category: CategoryId
  createTime: string
  /** 下架标记：true = 不出现在列表，可重新上架 */
  archived?: boolean
}
