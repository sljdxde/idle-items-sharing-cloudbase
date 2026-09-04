// ================================================
// cloudflare-worker/security.js — 代理共用安全原语（Worker / Pages / 自建 Node）
// 不依赖 Cloudflare 特有 API；Web Crypto 优先，Node 回退 node:crypto。
// ================================================

export const PHONE_RE = /^1[3-9]\d{9}$/
export const CATEGORY_SET = new Set([
  'home',
  'electronics',
  'kids',
  'outdoor',
  'tools',
  'books',
  'clothing',
  'other',
])
export const NAME_MAX = 50
export const DESC_MAX = 300
export const CONTACT_MAX = 40
export const IMG_DATA_MAX = 56000
export const BODY_MAX = 80000

export function isValidPhone(v) {
  return PHONE_RE.test(String(v || '').trim())
}

export function requirePhone(v) {
  const p = String(v || '').trim()
  return isValidPhone(p) ? p : ''
}

/** 约 110m 网格，避免把精确住址写进公开面 */
export function roundCoord(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.round(n * 1000) / 1000
}

export function clampLatLng(lat, lng) {
  const la = roundCoord(typeof lat === 'number' ? lat : Number(lat))
  const ln = roundCoord(typeof lng === 'number' ? lng : Number(lng))
  if (la === null || ln === null) return { lat: null, lng: null }
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return { lat: null, lng: null }
  return { lat: la, lng: ln }
}

/**
 * 图片 URL 白名单：本站上传路径 或 jpeg/png/webp 的 data URI。
 * 拒绝 javascript:、远程 URL、SVG、HTML。
 */
export function safeImgUrl(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (u.startsWith('/uploads/')) {
    return /^\/uploads\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(u) ? u : ''
  }
  if (u.length > IMG_DATA_MAX + 64) return ''
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+=*$/i.test(u)) return u
  return ''
}

export function normalizeCategory(v) {
  const s = String(v || '')
  return CATEGORY_SET.has(s) ? s : 'other'
}

export function sanitizeText(v, max) {
  return String(v || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max)
}

export function isAllowedOrigin(origin) {
  if (!origin) return true
  let u
  try {
    u = new URL(origin)
  } catch {
    return false
  }
  const host = u.hostname
  if (host === 'localhost' || host === '127.0.0.1') return true
  if (u.protocol !== 'https:') return false
  if (host === 'sljdxde.github.io') return true
  if (host.endsWith('.github.io')) return true
  if (host.endsWith('.pages.dev')) return true
  if (host.endsWith('.workers.dev')) return true
  return false
}

export function hasItemLabel(issue) {
  return (issue.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === 'item')
}

/** 对外 JSON：保留登录匹配用的身份电话，去掉口令哈希等内部字段 */
export function toPublicItem(item) {
  const ownerPhone = requirePhone(item.ownerPhone)
  const borrowedBy = requirePhone(item.borrowedBy)
  return {
    id: item.id,
    name: item.name,
    desc: item.desc,
    contactType: item.contactType === 'building' ? 'building' : 'phone',
    contact: sanitizeText(item.contact, CONTACT_MAX),
    imgUrl: safeImgUrl(item.imgUrl),
    status: item.status === 'lent' ? 'lent' : 'available',
    ownerPhone: ownerPhone || undefined,
    borrowedBy: borrowedBy || undefined,
    borrowedAt: typeof item.borrowedAt === 'string' ? item.borrowedAt : undefined,
    lat: roundCoord(item.lat),
    lng: roundCoord(item.lng),
    category: normalizeCategory(item.category),
    createTime: item.createTime,
    archived: !!item.archived,
    rentType: item.rentType === 'daily' || item.rentType === 'perUse' ? item.rentType : 'free',
    rentFee: typeof item.rentFee === 'number' && Number.isFinite(item.rentFee) && item.rentFee >= 0 ? item.rentFee : 0,
    rentRecords: Array.isArray(item.rentRecords) ? item.rentRecords : undefined,
  }
}
