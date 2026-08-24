// ================================================
// src/lib/config.ts — 站点配置单点
// ================================================

export const GH_OWNER = 'sljdxde'
export const GH_REPO = 'idle-items-sharing-cloudbase'
export const REPO = `${GH_OWNER}/${GH_REPO}`
export const REPO_URL = `https://github.com/${REPO}`
export const GH_API = `https://api.github.com/repos/${REPO}`

/** 匿名 API 兜底读取的本地缓存 key 与 TTL（毫秒） */
export const LIST_CACHE_KEY = 'ns_list_cache'
export const LIST_CACHE_TTL = 5 * 60 * 1000
