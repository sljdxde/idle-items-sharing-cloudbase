// ================================================
// src/lib/api.ts — 云端写操作代理客户端（Cloudflare Worker，ADR-0001）
// 浏览器只调代理 /api/*，GitHub Token 永不进客户端；用户全程无感 GitHub。
// 部署：cloudflare-worker/wrangler.toml 顶部说明；部署后把 worker 地址回填 API_PROXY。
// ================================================

import type { CategoryId, ContactType, Item } from './types'

/** Cloudflare Worker 地址（github.io 部署时使用；公开信息，非秘密） */
const WORKER_URL = 'https://neighborhood-share-proxy.neighborhood-share-sljdxde.workers.dev'

/**
 * 代理基址：
 * - GitHub Pages（*.github.io）→ Worker（workers.dev 在部分网络被墙，作为 Pages 部署的写通道）
 * - 自建服务器部署 → 同源 /api（nginx 80 → Node 代理，国内直连最快）
 */
export const API_PROXY =
  typeof location !== 'undefined' && location.hostname.endsWith('github.io') ? WORKER_URL : ''

/** 自建服务器通道：图片由服务端落盘存储，不受 Issue 正文 64KB 限制 */
export const IS_SERVER_CHANNEL = API_PROXY === ''

/** 与 worker 约定的站点 key（仅挡普通爬虫，非秘密） */
export const SITE_KEY = 'neighborhood-share-2026'

export class ApiError extends Error {}

/** 请求超时：workers.dev 在部分网络被墙时 TCP 会挂住，必须有上限才能给用户明确反馈 */
const REQUEST_TIMEOUT_MS = 12000

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${API_PROXY}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', 'x-site-key': SITE_KEY },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
    })
  } catch {
    throw new ApiError('网络异常，请稍后再试')
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T
  if (!res.ok) throw new ApiError(data.error || '服务暂时不可用，请稍后再试')
  return data
}

export interface PublishPayload {
  name: string
  desc: string
  contactType: ContactType
  contact: string
  imgUrl: string
  category: CategoryId
  ownerPhone: string
  lat: number | null
  lng: number | null
}

export const api = {
  listItems(): Promise<Item[]> {
    return request<Item[]>('/api/items')
  },
  publish(draft: PublishPayload): Promise<{ ok: boolean; id: number }> {
    return request('/api/items', { method: 'POST', body: draft })
  },
  borrow(id: number, operatorPhone: string): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/borrow`, { method: 'POST', body: { operatorPhone } })
  },
  returnBack(id: number, operatorPhone: string): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/return`, { method: 'POST', body: { operatorPhone } })
  },
  archive(id: number, operatorPhone: string): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/archive`, { method: 'POST', body: { operatorPhone } })
  },
  unarchive(id: number, operatorPhone: string): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/unarchive`, { method: 'POST', body: { operatorPhone } })
  },
  remove(id: number, operatorPhone: string): Promise<{ ok: boolean }> {
    return request(`/api/items/${id}/delete`, { method: 'POST', body: { operatorPhone } })
  },
}
