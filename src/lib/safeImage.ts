// ================================================
// src/lib/safeImage.ts — 渲染前的图片 URL 白名单（与代理同规则）
// ================================================

const DATA_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+=*$/i
const UPLOAD_RE = /^\/uploads\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i

/**
 * 体积上限与代理保持一致：security.js 的 `IMG_DATA_MAX + 64`（56064）。
 * 这里放宽或收紧都会造成「前端能显示、服务端拒收」的错位。
 */
const MAX_DATA_LEN = 56064

/** 非法地址返回空串，调用方走占位图 */
export function safeImgUrl(url: string | undefined | null): string {
  const u = String(url || '').trim()
  if (!u) return ''
  if (UPLOAD_RE.test(u)) return u
  if (u.length <= MAX_DATA_LEN && DATA_RE.test(u)) return u
  return ''
}
