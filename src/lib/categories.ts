// ================================================
// src/lib/categories.ts — 分类体系
// 新物品发布时手动选择；旧数据无分类字段时按关键词推断（仅展示层，不回写）
// ================================================

import type { CategoryId } from './types'

export interface CategoryDef {
  id: CategoryId | 'all'
  label: string
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'all', label: '全部' },
  { id: 'home', label: '家居' },
  { id: 'electronics', label: '电器' },
  { id: 'kids', label: '儿童' },
  { id: 'outdoor', label: '户外' },
  { id: 'tools', label: '工具' },
  { id: 'books', label: '图书' },
  { id: 'clothing', label: '服饰' },
  { id: 'other', label: '其他' },
]

/** 发布表单可选的分类（不含「全部」） */
export const PUBLISH_CATEGORIES: CategoryDef[] = CATEGORIES.filter(
  (c) => c.id !== 'all',
)

function isCategoryId(v: string): v is CategoryId {
  return CATEGORIES.some((c) => c.id !== 'all' && c.id === v)
}

/** 宽松归一：空串/未知值 → other */
export function normalizeCategory(v: string | null | undefined): CategoryId {
  if (v && isCategoryId(v)) return v
  return 'other'
}

const KEYWORD_MAP: Array<[CategoryId, RegExp]> = [
  [
    'electronics',
    /吸尘器|加湿器|电视|冰箱|洗衣机|空调|音箱|耳机|手机|电脑|平板|相机|投影|风扇|净化器|电饭煲|微波炉|电吹风|剃须刀|显示器|键盘/i,
  ],
  ['tools', /电钻|扳手|螺丝刀|梯子|工具箱|锤子|锯|卷尺|打气筒|热熔胶/i],
  ['books', /书|绘本|图书|小说|杂志|教材|漫画|字典/i],
  [
    'kids',
    /儿童|婴儿|宝宝|幼儿|玩具|滑板车|推车|安全座椅|尿布|奶瓶/i,
  ],
  [
    'outdoor',
    /帐篷|露营|睡袋|登山|鱼竿|钓鱼|自行车|骑行|烧烤|野餐|羽毛球|篮球|足球|瑜伽垫/i,
  ],
  [
    'home',
    /晾衣架|收纳|桌子|椅子|凳|床|床垫|沙发|灯|花盆|餐具|锅|水杯|镜子|窗帘|地毯/i,
  ],
  ['clothing', /外套|大衣|羽绒服|裙|鞋|靴|包|帽子|围巾|手套/i],
]

/** 展示层兜底：根据名称+描述关键词推断分类；无法识别 → other */
export function inferCategory(name: string, desc: string): CategoryId {
  const text = `${name} ${desc}`
  for (const [id, re] of KEYWORD_MAP) {
    if (re.test(text)) return id
  }
  return 'other'
}
