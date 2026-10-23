// ================================================
// src/lib/api.ts — 云端写操作代理客户端（Cloudflare Worker，ADR-0001 + ADR-0005）
// 浏览器只调代理 /api/*，GitHub Token 永不进客户端；用户全程无感 GitHub。
// ADR-0005：登录/注册返回 JWT，写操作通过 Authorization: Bearer <jwt> 鉴权。
// 部署：cloudflare-worker/wrangler.toml 顶部说明；部署后把 worker 地址回填 API_PROXY。
// ================================================

import type { CategoryId, ContactType, Item } from './types'
import { getSessionToken } from './session'

/** Cloudflare Worker 地址（github.io 部署时使用；公开信息，非秘密） */
const WORKER_URL = 'https://neighborhood-share-proxy.neighborhood-share-sljdxde.workers.dev'

const HOST = typeof location !== 'undefined' ? location.hostname : ''

/**
 * 代理基址：
 * - GitHub Pages（*.github.io）→ Worker（workers.dev 在部分网络被墙，作为 Pages 部署的写通道）
 * - Cloudflare Pages（*.pages.dev）→ 同源 /api（Pages Function，国内可达 + 自带 HTTPS）
 * - 自建服务器部署 → 同源 /api（nginx 80 → Node 代理，国内直连最快）
 */
export const API_PROXY = HOST.endsWith('github.io') ? WORKER_URL : ''

/**
 * 是否服务端可落盘图片（仅自建服务器通道为 true）。
 * github.io / pages.dev 都是 serverless、无磁盘，图片需内嵌压缩进 Issue 正文（64KB 上限）。
 */
export const IS_SERVER_CHANNEL = !HOST.endsWith('github.io') && !HOST.endsWith('pages.dev')

/** 与 worker 约定的站点 key（仅挡普通爬虫，非秘密） */
export const SITE_KEY = 'neighborhood-share-2026'

export class ApiError extends Error {
  /** HTTP 状态码；0 表示没拿到响应（网络异常/超时） */
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 请求超时：workers.dev 在部分网络被墙时 TCP 会挂住，必须有上限才能给用户明确反馈 */
const REQUEST_TIMEOUT_MS = 12000

/**
 * 从 localStorage 读取 JWT（auth store 的 TOKEN_KEY，避免循环依赖直接读）。
 * 隐私模式下写不进 localStorage，此时只存在 session.ts 的内存镜像里 → 必须先看内存。
 */
function getToken(): string | null {
  const mem = getSessionToken()
  if (mem) return mem
  try {
    return localStorage.getItem('linli_haowu_token_v2')
  } catch {
    return null
  }
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> },
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-site-key': SITE_KEY,
    ...init?.headers,
  }
  // ADR-0005：写操作带 JWT
  if (init?.auth !== false) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(`${API_PROXY}${path}`, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
    })
  } catch {
    throw new ApiError('网络异常，请稍后再试')
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new ApiError(data.error || '服务暂时不可用，请稍后再试', res.status)
  return data
}

export interface PublishPayload {
  name: string
  desc: string
  contactType: ContactType
  contact: string
  imgUrl: string
  category: CategoryId
  /** ADR-0005：不再需要，服务端从 JWT 提取；过渡期保留兼容 */
  ownerPhone?: string
  lat: number | null
  lng: number | null
  rentType: 'free' | 'daily' | 'perUse'
  rentFee: number
}

export interface LoginResult {
  ok: boolean
  token?: string
  phone?: string
  error?: string
}

export interface AdminResetResult {
  ok: boolean
  phone?: string
  temporaryPin?: string
  error?: string
}

export const api = {
  /**
   * 物品列表。fresh=true 表示「绕过代理端 5s 缓存，直接问服端」，
   * 写后的后台对账必须用它，否则三次对账全落在同一份缓存上（等于只问了一次）。
   */
  listItems(fresh = false): Promise<Item[]> {
    // 带上身份（若已登录）：服务端据此决定「已下架物品的联系方式」要不要回给你。
    // 未登录时 request 不会附 Authorization，等价于匿名读取。
    return request<Item[]>(`/api/items${fresh ? '?fresh=1' : ''}`)
  },

  // ─── ADR-0005: 账号体系接口 ───

  /** 注册：手机号 + 6位管理口令 → 返回 JWT */
  register(phone: string, pin: string): Promise<LoginResult> {
    return request<LoginResult>('/api/register', {
      method: 'POST',
      body: { phone, pin },
      auth: false,
    })
  },

  /** 登录：手机号 + 6位管理口令 → 返回 JWT */
  login(phone: string, pin: string): Promise<LoginResult> {
    return request<LoginResult>('/api/login', {
      method: 'POST',
      body: { phone, pin },
      auth: false,
    })
  },

  /**
   * 管理员重置用户口令。
   * 必须走 API_PROXY（与其余写操作同一条通道）：GitHub Pages 部署下 /api/* 在
   * Pages 域名上并不存在，直接 fetch 相对路径会拿到 404 HTML，解析必然失败。
   */
  adminReset(phone: string, newPin: string, adminToken: string): Promise<AdminResetResult> {
    return request<AdminResetResult>('/api/admin/reset-pin', {
      method: 'POST',
      body: { phone, newPin },
      auth: false,
      headers: { 'x-admin-token': adminToken },
    })
  },

  // ─── 物品写操作（ADR-0005：JWT 鉴权，不再传 operatorPhone） ───

  publish(draft: PublishPayload): Promise<{ ok: boolean; id: number }> {
    return request('/api/items', { method: 'POST', body: draft })
  },

  borrow(id: number): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/borrow`, { method: 'POST', body: {} })
  },

  returnBack(id: number): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/return`, { method: 'POST', body: {} })
  },

  archive(id: number): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/archive`, { method: 'POST', body: {} })
  },

  unarchive(id: number): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/unarchive`, { method: 'POST', body: {} })
  },

  remove(id: number): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/delete`, { method: 'POST', body: {} })
  },
}
