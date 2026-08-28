// ================================================
// src/lib/types.ts — 领域类型（本地数据层 + 定位 + 手机号用户体系）
// 状态机：available(可借) ⇄ lent(已借出)；archived 为物主的上下架标记
// ================================================

export type ItemStatus = 'available' | 'lent'

/** 联系方式二选一：手机号 或 楼号门牌 */
export type ContactType = 'phone' | 'building'

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
  /** 联系方式类型（手机号 / 楼号门牌 二选一） */
  contactType: ContactType
  /** 联系方式内容：手机号 或 楼号门牌 */
  contact: string
  /** 图片外链（可选） */
  imgUrl: string
  /** 借阅状态：available=可借，lent=已借出 */
  status: ItemStatus
  /** 借阅者手机号（status=lent 时记录归还责任人） */
  borrowedBy?: string
  /** 借出时间（ISO）；status=lent 时有值 */
  borrowedAt?: string
  /** 发布者（物主）手机号；用户体系以登录手机号区分发布者与借阅者 */
  ownerPhone: string
  /** 发布时自动获取的定位（纬度）；获取失败为 null */
  lat: number | null
  /** 发布时自动获取的定位（经度）；获取失败为 null */
  lng: number | null
  category: CategoryId
  createTime: string
  /** 下架标记：true = 不出现在公共列表（「我的发布」内可见，可重新上架） */
  archived?: boolean
}
