// ================================================
// src/lib/api.ts — 云端写操作代理客户端（Cloudflare Worker，ADR-0001）
// 浏览器只调代理 /api/*，GitHub Token 永不进客户端；用户全程无感 GitHub。
// 部署：cloudflare-worker/wrangler.toml 顶部说明；部署后把 worker 地址回填 API_PROXY。
// ================================================

import type { CategoryId, ContactType, Item } from './types'

/** Worker 部署地址（公开信息，非秘密）；空串 = 未开通，写操作友好降级 */
export const API_PROXY = ''

/** 与 worker 约定的站点 key（仅挡普通爬虫，非秘密） */
export const SITE_KEY = 'neighborhood-share-2026'

export class ApiError extends Error {}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!API_PROXY) throw new ApiError('云端服务尚未开通，请联系站长')
  let res: Response
  try {
    res = await fetch(`${API_PROXY}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', 'x-site-key': SITE_KEY },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError('网络异常，请稍后再试')
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
}
