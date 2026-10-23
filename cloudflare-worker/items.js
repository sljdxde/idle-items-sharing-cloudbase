// ================================================
// cloudflare-worker/items.js — 物品数据块的读写与状态映射（共享领域层）
//
// 为什么单独一个文件：Worker（cf 版）与自建 Node 代理（server/proxy-server.mjs）
// 原本各自复制了一份 toItem / extractData / 归还结算，已经漂移出真实 bug
// （Node 版漏了 rentType/rentFee/rentRecords，status 只看标签不看数据块）。
// 这里收敛成一份纯函数实现，两个通道都 import，单一真相源。
//
// 不依赖任何 Cloudflare API，只用 security.js 的纯函数。
// ================================================

import { DESC_MAX, sanitizeText } from './security.js'

const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/
const DAY_MS = 86400000

/** 从 Issue body 提取 DATA 块 JSON；缺失/损坏返回 {} */
export function extractData(body) {
  const m = body ? body.match(DATA_RE) : null
  if (!m || !m[1]) return {}
  try {
    const parsed = JSON.parse(m[1].trim())
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 是否「已借出」。
 * 数据块里的 borrowerHash 与 lent 标签任一命中都算 —— 借用是「先写数据块、后打标签」
 * 两步操作，标签写失败时数据块仍是真相，不能因此把物品当可借（否则第二个人能借走，
 * 覆盖掉第一个借阅人）。前后端共用这一条判定，避免两边口径不一致。
 */
export function isLentIssue(issue, data) {
  const labeled = (issue.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === 'lent')
  return labeled || !!data.borrowerHash
}

/** 价格/租金字段归一（免费 / 按天 / 按次） */
export function normalizeRent(rentType, rentFee) {
  const type = rentType === 'daily' || rentType === 'perUse' ? rentType : 'free'
  const feeRaw = Number(rentFee)
  const fee = type === 'free' ? 0 : Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw : 0
  return { rentType: type, rentFee: fee }
}

/** Issue → 对外物品对象（status 由 isLentIssue 决定，含租金字段） */
export function toItem(issue) {
  const d = extractData(issue.body)
  const rent = normalizeRent(d.rentType, d.rentFee)
  return {
    id: issue.number,
    name:
      typeof d.name === 'string' && d.name.trim()
        ? d.name
        : String(issue.title || '').replace(/^\[闲置物品\]\s*/, '').trim() || '未命名物品',
    desc: typeof d.desc === 'string' ? d.desc : '',
    contactType: d.contactType === 'building' ? 'building' : 'phone',
    contact: typeof d.contact === 'string' ? d.contact : '',
    imgUrl: typeof d.imgUrl === 'string' ? d.imgUrl : '',
    status: isLentIssue(issue, d) ? 'lent' : 'available',
    ownerHash: typeof d.ownerHash === 'string' && d.ownerHash ? d.ownerHash : '',
    borrowerHash: typeof d.borrowerHash === 'string' && d.borrowerHash ? d.borrowerHash : '',
    borrowedAt: typeof d.borrowedAt === 'string' ? d.borrowedAt : undefined,
    lat: typeof d.lat === 'number' && Number.isFinite(d.lat) ? d.lat : null,
    lng: typeof d.lng === 'number' && Number.isFinite(d.lng) ? d.lng : null,
    category: typeof d.category === 'string' ? d.category : 'other',
    createTime:
      typeof d.createTime === 'string' ? d.createTime : issue.created_at || new Date().toISOString(),
    archived: issue.state === 'closed',
    rentType: rent.rentType,
    rentFee: rent.rentFee,
    rentRecords: Array.isArray(d.rentRecords) ? d.rentRecords : undefined,
  }
}

/** 用数据块重建 Issue body（公开描述 + 自动生成的数据块） */
export function withDataBlock(_oldBody, data) {
  const publicDesc = sanitizeText(data.desc, DESC_MAX)
  const block = `<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->`
  return `${publicDesc}\n\n${block}\n\n— 以下为自动生成的数据块，请勿删除 —`
}

/**
 * 已下架物品的联系方式只给物主。
 *
 * 「下架」的语义是「从公开面撤下」，但列表接口是匿名的、返回全量（含 closed），
 * 所以只要拿到 id 就能看到撤下物品的手机号/门牌——下架等于没下架。
 * 这里按调用者身份裁剪：非物主（含未登录）拿到空 contact。
 *
 * 注意：不删字段而是置空，前端仍能区分「本来就没填」与「被隐藏」
 * （前端已按 archived + 归属自行展示「仅发布者可见」）。
 */
export function redactArchived(item, callerHash) {
  if (!item || !item.archived) return item
  if (callerHash && item.ownerHash && item.ownerHash === callerHash) return item
  return { ...item, contact: '' }
}

/** 对列表逐条裁剪（保持原顺序，不改入参） */
export function redactListForCaller(list, callerHash) {
  return list.map((it) => redactArchived(it, callerHash))
}

/**
 * 归还结算：按「按天向上取整、不足 1 天算 1 天 / 按次固定」追加一条结算记录。
 * 入参 data 不被修改，返回新的 data（含新的 rentRecords）。
 */
export function withRentRecord(data, returnedAt = new Date().toISOString()) {
  const { rentType, rentFee } = normalizeRent(data.rentType, data.rentFee)
  if (rentType === 'free' || !data.borrowedAt) return data
  const start = Date.parse(data.borrowedAt)
  const end = Date.parse(returnedAt)
  let days
  let amount = 0
  if (rentType === 'daily') {
    days = Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(1, Math.ceil(Math.max(end - start, 0) / DAY_MS))
      : 1
    amount = rentFee * days
  } else {
    amount = rentFee
  }
  const records = Array.isArray(data.rentRecords) ? [...data.rentRecords] : []
  records.push({
    borrowedAt: data.borrowedAt,
    returnedAt,
    days,
    fee: amount,
    borrowerHash: data.borrowerHash,
  })
  return { ...data, rentRecords: records }
}
