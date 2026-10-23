// ================================================
// tests/bugfix-data.test.ts — 本轮 bug 修复的数据层回归
//
// 1) 实时列表返回空数组被当成「读取失败」→ 回退过期快照（已删物品复活）
// 2) 图片预算按文件字节算，base64 膨胀后被服务端拒（错误提示还误导）
// 3) 「已借出」只看 lent 标签，标签写失败就卡死 → 数据块 borrowerHash 才是真相
// 4) 自建 Node 代理的 toItem 丢了租金字段（两个通道口径漂移）
// 5) token 过期后 phoneHash 仍生效 → 界面显示管理按钮、点了必 401
// 6) 管理员重置绕过 API_PROXY（GitHub Pages 下必 404）
// ================================================

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { listItems } from '../src/lib/github'
import { compressToFit, estimateDataUriLength } from '../src/lib/image'
import { api, ApiError } from '../src/lib/api'
import { isLentIssue, toItem, withRentRecord } from '../cloudflare-worker/items.js'
import { useAuthStore } from '../src/stores/auth'

/** 按 URL 匹配返回的 fetch 桩；记录每次请求便于断言 */
function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const { status = 200, body } = handler(String(url), init)
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  ;(globalThis as any).fetch = fn
  ;(window as any).fetch = fn
  return calls
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('listItems：空列表是合法结果，不是读取失败', () => {
  it('实时通道返回 [] 就直接返回空列表，不再回退快照', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/api/items')) return { body: [] }
      // 快照里还留着已删除的旧物品：一旦被回退就会「复活」
      return { body: [{ id: 7, name: '已删除的旧物品', status: 'available' }] }
    })

    const items = await listItems(true)
    expect(items).toEqual([])
    // 只问了实时通道，没有去读快照
    expect(calls.filter((c) => c.url.includes('items.json'))).toHaveLength(0)
  })

  it('快照为空但实时有货：用实时的（部署后才发布的新物品能看到）', async () => {
    stubFetch((url) => {
      if (url.includes('/api/items')) return { body: [{ id: 9, name: '新发布', status: 'available' }] }
      return { body: [] }
    })
    const items = await listItems(false)
    expect(items.map((it) => it.id)).toEqual([9])
  })
})

describe('compressToFit：预算口径是 data URI 字符数', () => {
  it('文件字节数达标但 base64 后超字符预算 → 不直通', async () => {
    // 4000 字节 → data URI ≈ 5357 字符，超过 5000 的预算
    const bytes = new Uint8Array(4000).fill(3)
    const file = new File([bytes], 'x.jpg', { type: 'image/jpeg' })
    expect(estimateDataUriLength(file.size)).toBeGreaterThan(5000)

    // happy-dom 无 canvas：走压缩路径会 reject，这正说明它没有直通
    await expect(compressToFit(file, 5000)).rejects.toThrow()
  })

  it('字符预算足够时仍然直通（不损画质）', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const file = new File([bytes], 'y.jpg', { type: 'image/jpeg' })
    const uri = await compressToFit(file, 5000)
    expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(uri.length).toBeLessThanOrEqual(5000)
  })

  it('服务端 IMG_DATA_MAX(56000) 之下的预算能覆盖直通上限', () => {
    // 客户端预算必须小于服务端上限，且留出 JSON 包裹余量
    const CLIENT_BUDGET = 52000
    const SERVER_IMG_MAX = 56000
    expect(CLIENT_BUDGET).toBeLessThan(SERVER_IMG_MAX)
    // 38KB 的 jpeg 仍可直通（≈51900 字符），39KB 就必须压缩（≈53250 字符）
    expect(estimateDataUriLength(38 * 1024)).toBeLessThanOrEqual(CLIENT_BUDGET)
    expect(estimateDataUriLength(39 * 1024)).toBeGreaterThan(CLIENT_BUDGET)
  })
})

describe('items.js：状态以数据块为真相，租金字段不再丢', () => {
  const issue = (data: Record<string, unknown>, labels: string[] = ['item']) => ({
    number: 12,
    title: '[闲置物品] 冲击钻',
    state: 'open',
    created_at: '2026-09-01T00:00:00.000Z',
    labels: labels.map((name) => ({ name })),
    body: `描述\n\n<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->`,
  })

  it('lent 标签写失败（只剩 borrowerHash）也算已借出', () => {
    const it = toItem(issue({ name: '冲击钻', borrowerHash: 'hash-b', borrowedAt: '2026-09-02T00:00:00Z' }, ['item']))
    expect(it.status).toBe('lent')
    expect(isLentIssue(issue({ borrowerHash: 'hash-b' }, ['item']), { borrowerHash: 'hash-b' })).toBe(true)
  })

  it('两者都没有才是可借', () => {
    expect(toItem(issue({ name: '冲击钻' })).status).toBe('available')
  })

  it('租金字段（类型/金额/历史结算）在映射后仍然存在', () => {
    const records = [{ borrowedAt: 'a', returnedAt: 'b', days: 2, fee: 10 }]
    const it = toItem(issue({ name: '冲击钻', rentType: 'daily', rentFee: 5, rentRecords: records }))
    expect(it.rentType).toBe('daily')
    expect(it.rentFee).toBe(5)
    expect(it.rentRecords).toHaveLength(1)
  })

  it('归还结算：按天向上取整、免费不记', () => {
    const daily = withRentRecord(
      { rentType: 'daily', rentFee: 5, borrowedAt: '2026-09-01T00:00:00Z', borrowerHash: 'h' },
      '2026-09-02T06:00:00Z',
    )
    expect(daily.rentRecords).toHaveLength(1)
    expect(daily.rentRecords[0].days).toBe(2)
    expect(daily.rentRecords[0].fee).toBe(10)

    const free = withRentRecord({ rentType: 'free', rentFee: 0, borrowedAt: '2026-09-01T00:00:00Z' })
    expect(free.rentRecords).toBeUndefined()

    // 入参不被修改
    const src = { rentType: 'perUse', rentFee: 3, borrowedAt: '2026-09-01T00:00:00Z' }
    withRentRecord(src)
    expect(src.rentRecords).toBeUndefined()
  })
})

describe('auth：过期 token 不再当身份', () => {
  it('token 过期 → isLoggedIn=false，phoneHash 也为空', () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
    const now = Math.floor(Date.now() / 1000)
    localStorage.setItem(
      'linli_haowu_token_v2',
      [b64({ alg: 'HS256' }), b64({ phoneHash: 'hash-x', iat: now - 100, exp: now - 10 }), 'sig'].join('.'),
    )
    const auth = useAuthStore()
    expect(auth.isLoggedIn).toBe(false)
    // 关键：过期后不能再拿 phoneHash 去点亮「管理 / 归还」按钮
    expect(auth.phoneHash).toBe('')
  })
})

describe('api.adminReset：必须走代理通道并带管理员令牌', () => {
  it('请求路径与头部正确，失败时抛带状态码的 ApiError', async () => {
    const calls = stubFetch(() => ({ status: 403, body: { error: '管理员令牌错误' } }))
    await expect(api.adminReset('13800000001', '482913', 'admin-token-1')).rejects.toBeInstanceOf(ApiError)

    const req = calls[0]
    expect(req.url).toContain('/api/admin/reset-pin')
    const headers = req.init?.headers as Record<string, string>
    expect(headers['x-admin-token']).toBe('admin-token-1')
    expect(headers['x-site-key']).toBeTruthy()

    const err = await api.adminReset('13800000001', '482913', 't').catch((e) => e as ApiError)
    expect(err.status).toBe(403)
  })
})
