// ================================================
// tests/worker-flows.test.ts — Worker 写通道的时序与契约回归
//
// 1) 归还：必须「先摘 lent 标签、再清数据块」，否则标签删除失败会留下
//    「标签=已借出、数据块=无人借」的死局（谁都不能归还，物主也删不掉）
// 2) 借用：标签写失败不应影响正确性（已借出以 borrowerHash 为准）
// 3) CORS 预检必须放行 x-admin-token（否则管理员页跨域必被浏览器拦）
// 4) GET /api/items?fresh=1 要真的绕过 5s 缓存（写后对账靠它）
// ================================================

import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../cloudflare-worker/worker.js'
import { signJwt } from '../cloudflare-worker/security.js'

const SITE_KEY = 'test-site-key'
const JWT_SECRET = 'test-jwt-secret'
const HASH_PEPPER = 'test-pepper'
const OWNER_HASH = 'hash-owner'
const BORROWER_HASH = 'hash-borrower'

const ENV = {
  GITHUB_TOKEN: 'gh-token',
  SITE_KEY,
  JWT_SECRET,
  HASH_PEPPER,
  AUDIT_MODE: 'disabled',
}

interface GhState {
  issue: Record<string, unknown>
  log: string[]
  failLabelWrites: boolean
  etag: string
  /** 模拟「读完之后被别人改了」：带 If-Match 的 PATCH 一律 412 */
  staleOnPatch: boolean
  /** 每个写请求带的 If-Match 值 */
  ifMatch: Array<string | null>
}

function makeGhStub(
  data: Record<string, unknown>,
  opts: { failLabelWrites?: boolean; staleOnPatch?: boolean } = {},
) {
  const state: GhState = {
    log: [],
    failLabelWrites: !!opts.failLabelWrites,
    etag: 'W/"v1"',
    staleOnPatch: !!(opts as { staleOnPatch?: boolean }).staleOnPatch,
    ifMatch: [],
    issue: {
      number: 12,
      title: '[闲置物品] 冲击钻',
      state: 'open',
      created_at: '2026-09-01T00:00:00.000Z',
      labels: [{ name: 'item' }],
      body: `冲击钻\n\n<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->\n`,
    },
  }

  const json = (body: unknown, status = 200, etag = '') =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...(etag ? { ETag: etag } : {}) },
    })

  ;(globalThis as any).fetch = async (rawUrl: string, init: RequestInit = {}) => {
    const url = new URL(String(rawUrl))
    const method = init.method || 'GET'
    state.log.push(`${method} ${url.pathname}${url.search}`)

    // 列表
    if (url.pathname.endsWith('/issues') && method === 'GET') return json([state.issue])
    // 单条
    if (/\/issues\/\d+$/.test(url.pathname) && method === 'GET') {
      return json(state.issue, 200, state.etag)
    }
    // 改 body / state
    if (/\/issues\/\d+$/.test(url.pathname) && method === 'PATCH') {
      const headers = (init.headers || {}) as Record<string, string>
      const ifMatch = headers['If-Match'] ?? null
      state.ifMatch.push(ifMatch)
      if (state.staleOnPatch && ifMatch) return json({ message: 'stale' }, 412)
      if (ifMatch && ifMatch !== state.etag) return json({ message: 'stale' }, 412)
      const patch = JSON.parse(String(init.body || '{}'))
      state.issue = { ...state.issue, ...patch }
      state.etag = `W/"v${Number(state.etag.replace(/\D/g, '')) + 1}"`
      return json(state.issue, 200, state.etag)
    }
    // 加标签
    if (/\/issues\/\d+\/labels$/.test(url.pathname) && method === 'POST') {
      if (state.failLabelWrites) return json({ message: 'boom' }, 500)
      const { labels } = JSON.parse(String(init.body || '{}'))
      const cur = (state.issue.labels as Array<{ name: string }>) || []
      state.issue = {
        ...state.issue,
        labels: [...cur, ...labels.map((name: string) => ({ name }))],
      }
      return json(state.issue.labels)
    }
    // 去标签
    if (/\/issues\/\d+\/labels\/[\w-]+$/.test(url.pathname) && method === 'DELETE') {
      if (state.failLabelWrites) return json({ message: 'boom' }, 500)
      const name = url.pathname.split('/').pop()
      const cur = (state.issue.labels as Array<{ name: string }>) || []
      const has = cur.some((l) => l.name === name)
      state.issue = { ...state.issue, labels: cur.filter((l) => l.name !== name) }
      return has ? new Response(null, { status: 200 }) : json({ message: 'Not Found' }, 404)
    }
    return json({ message: 'unhandled', url: url.pathname, method }, 404)
  }

  return state
}

function labelsOf(state: GhState): string[] {
  return ((state.issue.labels as Array<{ name: string }>) || []).map((l) => l.name)
}

function dataOf(state: GhState): Record<string, unknown> {
  const body = String(state.issue.body || '')
  const m = body.match(/<!--DATA_START([\s\S]*?)DATA_END-->/)
  return m ? JSON.parse(m[1].trim()) : {}
}

async function tokenFor(phoneHash: string): Promise<string> {
  return signJwt({ phoneHash }, JWT_SECRET)
}

async function post(path: string, phoneHash: string) {
  const token = await tokenFor(phoneHash)
  return handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-site-key': SITE_KEY,
        origin: 'https://linli-haowu.pages.dev',
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    }),
    ENV,
  )
}

beforeEach(() => {
  // 每个用例自己装 fetch 桩
})

describe('归还：先摘标签、再清数据块', () => {
  it('顺序正确，且归还后 lent 标签与 borrowerHash 同时清空', async () => {
    const state = makeGhStub({
      name: '冲击钻',
      ownerHash: OWNER_HASH,
      borrowerHash: BORROWER_HASH,
      borrowedAt: '2026-09-01T00:00:00.000Z',
      rentType: 'free',
    })
    state.issue.labels = [{ name: 'item' }, { name: 'lent' }]

    const res = await post('/api/items/12/return', BORROWER_HASH)
    expect(res.status).toBe(200)

    const labelAt = state.log.findIndex((l) => l.startsWith('DELETE') && l.includes('/labels/lent'))
    const patchAt = state.log.findIndex((l) => l.startsWith('PATCH') && /\/issues\/12$/.test(l))
    expect(labelAt, `标签删除没发生：${state.log.join(' | ')}`).toBeGreaterThanOrEqual(0)
    expect(patchAt).toBeGreaterThan(labelAt)

    expect(labelsOf(state)).toEqual(['item'])
    expect(dataOf(state).borrowerHash).toBeUndefined()
  })
})

describe('借用：标签写失败也不该让物品卡死', () => {
  it('lent 标签写失败仍返回成功，物品按 borrowerHash 视为已借出', async () => {
    const state = makeGhStub({ name: '冲击钻', ownerHash: OWNER_HASH }, { failLabelWrites: true })

    const res = await post('/api/items/12/borrow', BORROWER_HASH)
    expect(res.status).toBe(200)
    // 标签没加上，但数据块里有借阅人 → 列表仍显示已借出，借阅人也能归还
    expect(labelsOf(state)).not.toContain('lent')
    expect(dataOf(state).borrowerHash).toBe(BORROWER_HASH)
  })
})

describe('CORS 预检', () => {
  it('放行 x-admin-token，否则管理员页跨域必被浏览器拦', async () => {
    const res = await handle(
      new Request('http://localhost/api/admin/reset-pin', {
        method: 'OPTIONS',
        headers: { origin: 'https://linli-haowu.pages.dev' },
      }),
      ENV,
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-admin-token')
  })
})

describe('列表缓存与 fresh', () => {
  it('普通请求走 5s 缓存，?fresh=1 绕过缓存重新拉取', async () => {
    const state = makeGhStub({ name: '冲击钻', ownerHash: OWNER_HASH })
    const get = () =>
      handle(
        new Request('http://localhost/api/items', {
          headers: { 'x-site-key': SITE_KEY, origin: 'https://x.github.io' },
        }),
        ENV,
      )
    const getFresh = () =>
      handle(
        new Request('http://localhost/api/items?fresh=1', {
          headers: { 'x-site-key': SITE_KEY, origin: 'https://x.github.io' },
        }),
        ENV,
      )
    const listCalls = () =>
      state.log.filter((l) => l.startsWith('GET') && l.includes('state=all')).length

    await getFresh()
    const afterFresh = listCalls()
    expect(afterFresh).toBeGreaterThan(0)

    await get()
    expect(listCalls()).toBe(afterFresh) // 命中缓存

    await getFresh()
    expect(listCalls()).toBeGreaterThan(afterFresh) // 真的又问了上游
  })
})

describe('借用并发：If-Match 保护', () => {
  it('写请求带上 If-Match（值为刚读到的 etag）', async () => {
    const state = makeGhStub({ name: '冲击钻', ownerHash: OWNER_HASH })
    const res = await post('/api/items/12/borrow', BORROWER_HASH)
    expect(res.status).toBe(200)
    expect(state.ifMatch[0]).toBe('W/"v1"')
  })

  it('读完之后被别人改过（412）→ 409 且不覆盖对方', async () => {
    const state = makeGhStub({ name: '冲击钻', ownerHash: OWNER_HASH }, { staleOnPatch: true })
    const res = await post('/api/items/12/borrow', BORROWER_HASH)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('手慢了')
    // 关键：没有把 borrowerHash 写进去
    expect(dataOf(state).borrowerHash).toBeUndefined()
  })
})

describe('列表：已下架物品的联系方式按身份裁剪', () => {
  async function getListAs(phoneHash?: string) {
    const token = phoneHash ? await tokenFor(phoneHash) : ''
    const res = await handle(
      new Request('http://localhost/api/items?fresh=1', {
        headers: {
          'x-site-key': SITE_KEY,
          origin: 'https://x.github.io',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
      ENV,
    )
    return { status: res.status, list: (await res.json()) as Array<Record<string, unknown>> }
  }

  it('游客看不到已下架物品的联系方式，物主自己能看到', async () => {
    const state = makeGhStub({
      name: '冲击钻',
      contactType: 'phone',
      contact: '13800000001',
      ownerHash: OWNER_HASH,
    })
    state.issue.state = 'closed'

    const anon = await getListAs()
    expect(anon.status).toBe(200)
    expect(anon.list[0].archived).toBe(true)
    expect(anon.list[0].contact).toBe('')

    // 别人也看不到
    const other = await getListAs('hash-stranger')
    expect(other.list[0].contact).toBe('')

    // 物主能看到
    const owner = await getListAs(OWNER_HASH)
    expect(owner.list[0].contact).toBe('13800000001')
  })

  it('在架物品的联系方式对所有人可见（不受影响）', async () => {
    makeGhStub({ name: '冲击钻', contactType: 'phone', contact: '13800000001', ownerHash: OWNER_HASH })
    const anon = await getListAs()
    expect(anon.list[0].contact).toBe('13800000001')
  })
})
