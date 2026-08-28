// ================================================
// src/lib/contact.ts — 联系方式展示（纯函数）
// 展示优先级：楼牌号在前、手机号在后（当前模型二选一，未来双值也能正确排序）
// ================================================

import type { Item } from './types'

export interface ContactRow {
  label: string
  value: string
}

/** 有序联系方式行：楼牌号在前、手机号在后 */
export function contactRows(item: Item): ContactRow[] {
  const rows: ContactRow[] = []
  if (item.contactType === 'building' && item.contact.trim()) {
    rows.push({ label: '楼号门牌', value: item.contact.trim() })
  }
  if (item.contactType === 'phone' && item.contact.trim()) {
    rows.push({ label: '手机号', value: item.contact.trim() })
  }
  return rows
}

/** 138****1234 式脱敏；非法输入原样返回 */
export function maskPhone(p: string): string {
  return /^1\d{10}$/.test(p) ? p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : p
}

/** 卡片位置文案：楼号优先展示；否则显示脱敏手机号；都没有显示通用文案 */
export function cardPlaceText(item: Item): string {
  if (item.contactType === 'building' && item.contact.trim()) return item.contact.trim()
  if (item.contactType === 'phone' && item.contact.trim()) return maskPhone(item.contact.trim())
  return '联系方式见详情'
}
