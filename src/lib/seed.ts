// ================================================
// src/lib/seed.ts — 首次启动的示例种子数据
// 仅在本地存储为空时导入；之后一切以用户数据为准
// 坐标围绕「社区中心」小范围散布，便于演示距离筛选
// ================================================

import type { Item } from './types'

/** 演示用社区中心坐标（杭州桥西一带） */
const CENTER = { lat: 30.2745, lng: 120.14 }

/** 距社区中心约 d 米的偏移点（近似：纬度 1°≈111km） */
function near(dNorth: number, dEast: number): { lat: number; lng: number } {
  return {
    lat: +(CENTER.lat + dNorth / 111000).toFixed(6),
    lng: +(CENTER.lng + dEast / 111000).toFixed(6),
  }
}

const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString()

export const SEED_ITEMS: Item[] = [
  {
    id: 1,
    name: '戴森V8吸尘器',
    desc: '九成新，滤芯上周刚换，可借周末',
    contactType: 'phone',
    contact: '13800000001',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000001',
    ...near(150, 80),
    category: 'electronics',
    createTime: daysAgo(9),
  },
  {
    id: 2,
    name: '儿童滑板车',
    desc: '孩子长大了出闲置，轮子顺滑',
    contactType: 'building',
    contact: '5栋602',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000002',
    ...near(-260, 340),
    category: 'kids',
    createTime: daysAgo(7),
  },
  {
    id: 3,
    name: '露营四人间帐篷',
    desc: '含防潮垫，借前沟通行程',
    contactType: 'phone',
    contact: '13800000003',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000003',
    ...near(520, -180),
    category: 'outdoor',
    createTime: daysAgo(6),
  },
  {
    id: 4,
    name: '电钻+全套钻头',
    desc: '家庭维修神器，归还时附使用心得',
    contactType: 'building',
    contact: '2栋1203',
    imgUrl: '',
    status: 'lent',
    borrowedBy: '13900000003',
    ownerPhone: '13800000004',
    ...near(-90, -420),
    category: 'tools',
    createTime: daysAgo(5),
  },
  {
    id: 5,
    name: '英文原版绘本30册',
    desc: '适合3-6岁，整套借阅',
    contactType: 'building',
    contact: '8栋1502',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000005',
    ...near(780, 260),
    category: 'books',
    createTime: daysAgo(3),
  },
  {
    id: 6,
    name: '小米加湿器4L',
    desc: '静音，送两根新滤芯',
    contactType: 'phone',
    contact: '13800000006',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000006',
    ...near(-640, 90),
    category: 'home',
    createTime: daysAgo(1),
  },
]

/**
 * 本次读取是否落到了种子兜底（实时与快照都没拿到）。
 * 调用方用它拒绝「一次失败读取把真实社区列表换成演示数据」。
 */
export function isSeedFallback(list: Item[]): boolean {
  return list === SEED_ITEMS
}
