// ================================================
// src/lib/seed.ts — 首次启动的示例种子数据
// 仅在本地存储为空时导入；之后一切以用户数据为准
// ================================================

import type { Item } from './types'

const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString()

export const SEED_ITEMS: Item[] = [
  {
    id: 1,
    name: '戴森V8吸尘器',
    desc: '九成新，滤芯上周刚换，可借周末',
    contact: '微信 wang-mama',
    building: '3栋1801',
    imgUrl: '',
    status: 'available',
    requests: [],
    category: 'electronics',
    createTime: daysAgo(9),
  },
  {
    id: 2,
    name: '儿童滑板车',
    desc: '孩子长大了出闲置，轮子顺滑',
    contact: '',
    building: '5栋602',
    imgUrl: '',
    status: 'requested',
    requests: [
      {
        id: 'req-seed-1',
        fromName: '邻居小李',
        contact: '微信 li-xiao',
        message: '想借给家里娃周末玩两天',
        createdAt: daysAgo(1),
        status: 'pending',
      },
    ],
    category: 'kids',
    createTime: daysAgo(7),
  },
  {
    id: 3,
    name: '露营四人间帐篷',
    desc: '含防潮垫，借前沟通行程',
    contact: '微信 camp-lover',
    building: '7栋101',
    imgUrl: '',
    status: 'available',
    requests: [],
    category: 'outdoor',
    createTime: daysAgo(6),
  },
  {
    id: 4,
    name: '电钻+全套钻头',
    desc: '家庭维修神器，归还时附使用心得',
    contact: '微信 drill-master',
    building: '2栋1203',
    imgUrl: '',
    status: 'borrowed',
    requests: [],
    category: 'tools',
    createTime: daysAgo(5),
  },
  {
    id: 5,
    name: '英文原版绘本30册',
    desc: '适合3-6岁，整套借阅',
    contact: '',
    building: '8栋1502',
    imgUrl: '',
    status: 'available',
    requests: [],
    category: 'books',
    createTime: daysAgo(3),
  },
  {
    id: 6,
    name: '小米加湿器4L',
    desc: '静音，送两根新滤芯',
    contact: '微信 mist-user',
    building: '1栋801',
    imgUrl: '',
    status: 'available',
    requests: [],
    category: 'home',
    createTime: daysAgo(1),
  },
]
