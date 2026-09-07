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

/** 对外 JSON：保留登录匹配用的身份哈希，去掉口令等内部字段（ADR-0005） */
export function toPublicItem(item) {
  const ownerHash = typeof item.ownerHash === 'string' && item.ownerHash ? item.ownerHash : ''
  const borrowerHash = typeof item.borrowerHash === 'string' && item.borrowerHash ? item.borrowerHash : ''
  return {
    id: item.id,
    name: item.name,
    desc: item.desc,
    contactType: item.contactType === 'building' ? 'building' : 'phone',
    contact: sanitizeText(item.contact, CONTACT_MAX),
    imgUrl: safeImgUrl(item.imgUrl),
    status: item.status === 'lent' ? 'lent' : 'available',
    ownerHash: ownerHash || undefined,
    borrowerHash: borrowerHash || undefined,
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

/** 手机号脱敏：138****1234 */
export function maskPhone(phone) {
  const p = String(phone || '')
  return p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

/** 常见弱PIN黑名单 */
const WEAK_PINS = new Set([
  '123456', '654321', '012345', '987654',
  '111111', '000000', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
  '123123', '321321', '121212', '212121', '112233', '332211', '123321',
  '111222', '222111', '000111', '111000',
  '135790', '246801', '024680',
])

/**
 * 判断是否为弱PIN（6位数字）
 * 规则：6位相同 / 连续递增递减 / 常见弱PIN黑名单
 */
export function isWeakPin(pin) {
  if (typeof pin !== 'string' || pin.length !== 6 || !/^\d{6}$/.test(pin)) return true
  if (WEAK_PINS.has(pin)) return true
  const digits = pin.split('').map(Number)
  let ascending = true
  let descending = true
  for (let i = 1; i < 6; i++) {
    if (digits[i] !== (digits[i - 1] + 1) % 10) ascending = false
    if (digits[i] !== (digits[i - 1] + 9) % 10) descending = false
  }
  return ascending || descending
}

// ================================================
// ADR-0005: 账号体系安全原语
// 兼容 Cloudflare Worker (Web Crypto) 和 Node.js (globalThis.crypto)
// ================================================

// Cloudflare Worker / Pages / Node.js 19+ 均原生支持 globalThis.crypto (Web Crypto)
const _crypto = globalThis.crypto

/** Buffer → hex string */
function buf2hex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** base64url encode */
function b64urlEncode(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url decode → Uint8Array */
function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** 常量时间字符串比较（防时序攻击） */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * 计算手机号哈希：HMAC-SHA256(phone, HASH_PEPPER)
 * 用于公开数据中的不可逆身份标识（ADR-0005）
 * @param {string} phone - 11位手机号
 * @param {string} pepper - 环境变量 HASH_PEPPER
 * @returns {Promise<string>} 64位hex哈希
 */
export async function hashPhone(phone, pepper) {
  const enc = new TextEncoder()
  const key = await _crypto.subtle.importKey(
    'raw',
    enc.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await _crypto.subtle.sign('HMAC', key, enc.encode(String(phone).trim()))
  return buf2hex(sig)
}

/**
 * 生成随机盐（16字节 → 32位hex）
 */
export function generateSalt() {
  const arr = new Uint8Array(16)
  _crypto.getRandomValues(arr)
  return buf2hex(arr)
}

/**
 * 计算口令哈希：PBKDF2-SHA256(pin, salt, 100000 iterations)
 * 用于存储在 Cloudflare KV 中的口令哈希，慢哈希防暴力破解（ADR-0005）
 * @param {string} pin - 6位数字口令
 * @param {string} salt - 32位hex盐
 * @returns {Promise<string>} 64位hex哈希
 */
export async function hashPin(pin, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await _crypto.subtle.importKey(
    'raw',
    enc.encode(String(pin)),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await _crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
  return buf2hex(bits)
}

/**
 * 验证口令（常量时间比较）
 * @param {string} pin - 用户输入的口令
 * @param {string} storedHash - KV中存储的哈希
 * @param {string} salt - KV中存储的盐
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, storedHash, salt) {
  const computed = await hashPin(pin, salt)
  return timingSafeEqual(computed, storedHash)
}

/**
 * 签发 JWT（HS256）
 * @param {object} payload - 载荷（含 phoneHash）
 * @param {string} secret - JWT_SECRET
 * @param {number} expiresInSeconds - 过期时间（秒），默认7天
 * @returns {Promise<string>} JWT token
 */
export async function signJwt(payload, secret, expiresInSeconds = 7 * 24 * 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds }
  const enc = new TextEncoder()
  const key = await _crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const headerB64 = b64urlEncode(JSON.stringify(header))
  const payloadB64 = b64urlEncode(JSON.stringify(fullPayload))
  const data = `${headerB64}.${payloadB64}`
  const sig = await _crypto.subtle.sign('HMAC', key, enc.encode(data))
  return `${data}.${b64urlEncode(sig)}`
}

/**
 * 验证 JWT（HS256），返回 payload 或 null
 * @param {string} token - JWT token
 * @param {string} secret - JWT_SECRET
 * @returns {Promise<object|null>} payload 或 null（无效/过期）
 */
export async function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  try {
    const enc = new TextEncoder()
    const key = await _crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const data = `${headerB64}.${payloadB64}`
    const sig = b64urlDecode(sigB64)
    const valid = await _crypto.subtle.verify('HMAC', key, sig, enc.encode(data))
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

/**
 * 从 Authorization header 提取并验证 JWT
 * @param {Request} request
 * @param {string} secret
 * @returns {Promise<object|null>}
 */
export async function authFromRequest(request, secret) {
  const authHeader = request.headers.get('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  return verifyJwt(match[1], secret)
}
