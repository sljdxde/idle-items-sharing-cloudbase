// ================================================
// tests/items-store.test.ts — 物品 store 写后乐观更新 + 后台对账
// 守护两条用户可见契约：
// 1) 写操作 POST 成功即本地生效，不阻塞等刷新（否则按钮卡十几秒）
// 2) 滞后读取（items.json 快照 / 未追上的实时列表）不得把新状态改回旧值
// ================================================

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Item } from '@/lib/types'

vi.mock('@/lib/github', () => ({ listItems: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: {
    listItems: vi.fn(),
    publish: vi.fn(),
    borrow: vi.fn(),
    returnBack: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    remove: vi.fn(),
  },
}))

import { listItems } from '@/lib/github'
import { SEED_ITEMS } from '@/lib/seed'
import { api } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useItemsStore } from '@/stores/items'

const listMock = vi.mocked(listItems)
const apiMock = vi.mocked(api)
const toast = useToast()

/** 最近一次操作给用户的提示标题（「点了没反应」类 bug 的判据） */
const toastTitles = () => toast.toasts.map((t) => t.title)

const OWNER = '13800000001'
const BORROWER = '13800000009'

function makeItem(partial: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: '戴森V8吸尘器',
    desc: '九成新',
    contactType: 'phone',
    contact: OWNER,
    imgUrl: '',
    status: 'available',
    ownerPhone: OWNER,
    lat: null,
    lng: null,
    category: 'electronics',
    rentType: 'free',
    rentFee: 0,
    createTime: '2026-08-20T00:00:00.000Z',
    archived: false,
    ...partial,
  }
}

/** 纯微任务刷新：让 mock 的即时 Promise 链跑完，不消耗假时钟 */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}

/** 模拟「服务端还没追上」的滞后读取：始终返回当前 server 内容 */
let server: Item[]

async function mountStore(phone: string) {
  localStorage.clear()
  localStorage.setItem('linli_haowu_user_v1', phone)
  setActivePinia(createPinia())
  const store = useItemsStore()
  await flushAsync()
  return store
}

const snapshotReads = () => listMock.mock.calls.filter((c) => !c[0]).length

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  toast.toasts.splice(0)
  server = [makeItem()]
  listMock.mockImplementation(async () => server.map((it) => ({ ...it })))
  apiMock.borrow.mockResolvedValue({ ok: true })
  apiMock.returnBack.mockResolvedValue({ ok: true })
  apiMock.archive.mockResolvedValue({ ok: true })
  apiMock.unarchive.mockResolvedValue({ ok: true })
  apiMock.remove.mockResolvedValue({ ok: true })
  apiMock.publish.mockResolvedValue({ ok: true, id: 99 })
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('读取：内存有数据时不回读快照', () => {
  it('页面间来回导航不触发快照读取（快照滞后会把写后状态改回旧值）', async () => {
    const store = await mountStore(BORROWER)
    const reads = snapshotReads()
    expect(store.items).toHaveLength(1)

    await store.load()
    await store.load()
    expect(snapshotReads()).toBe(reads)

    // 显式刷新仍走实时通道
    await store.refresh()
    expect(listMock.mock.calls.some((c) => c[0] === true)).toBe(true)
  })

  it('首屏快照滞后时用实时列表静默校准一次', async () => {
    let reads = 0
    listMock.mockImplementation(async () => {
      reads++
      return reads === 1
        ? [makeItem({ status: 'available' })]
        : [makeItem({ status: 'lent', borrowedBy: '13800000003' })]
    })
    const store = await mountStore(BORROWER)
    expect(store.itemById(1)?.status).toBe('lent')
    expect(snapshotReads()).toBe(1)

    await store.load()
    expect(reads).toBe(2)
  })

  it('实时与快照都读不到时，已有列表不被演示种子覆盖', async () => {
    server = [makeItem({ id: 42, name: '邻居的电钻' })]
    const store = await mountStore(BORROWER)
    expect(store.items.map((it) => it.id)).toEqual([42])

    // 代理被墙 + 快照缺失：listItems 落到最后一级兜底
    listMock.mockResolvedValueOnce(SEED_ITEMS)
    await store.refresh()
    expect(store.items.map((it) => it.id)).toEqual([42])
  })

  it('冷启动什么都没读到，才显示演示种子', async () => {
    server = []
    listMock.mockResolvedValue(SEED_ITEMS)
    const store = await mountStore(BORROWER)
    expect(store.items).toHaveLength(SEED_ITEMS.length)
  })
})

describe('借用 / 归还：本地立即生效，滞后读取不回退', () => {
  it('POST 成功即变「已借出」，对账期间的滞后列表仍是可借也不覆盖', async () => {
    const store = await mountStore(BORROWER)
    expect(await store.borrow(1)).toBe(true)
    expect(store.itemById(1)?.status).toBe('lent')
    expect(store.itemById(1)?.borrowedBy).toBe(BORROWER)

    // 第一次后台对账：服务端未追上，返回旧的 available
    await flushAsync()
    expect(store.itemById(1)?.status).toBe('lent')

    // 服务端追上后，第二次对账收敛并交还服务端真相
    server = [makeItem({ status: 'lent', borrowedBy: BORROWER, borrowedAt: '2026-09-01T00:00:00.000Z' })]
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.itemById(1)?.status).toBe('lent')

    // 对账已完成：他人归还等服务端变化能正常同步进来
    server = [makeItem({ status: 'available' })]
    await store.refresh()
    expect(store.itemById(1)?.status).toBe('available')
  })

  it('归还后立即恢复「可借」，不必等列表读取', async () => {
    server = [makeItem({ status: 'lent', borrowedBy: BORROWER })]
    const store = await mountStore(BORROWER)
    expect(await store.returnBack(1)).toBe(true)
    expect(store.itemById(1)?.status).toBe('available')
    expect(store.borrowedItems).toHaveLength(0)
  })
})

describe('发布 / 删除：乐观补位与乐观隐藏', () => {
  it('发布成功后新物品立即可见（服务端列表还没返回它）', async () => {
    const store = await mountStore(OWNER)
    const ok = await store.publish({
      name: ' 露营灯 ',
      desc: ' LED ',
      contactType: 'phone',
      contact: OWNER,
      imgUrl: '',
      category: 'outdoor',
      position: null,
    })
    expect(ok).toBe(true)
    const created = store.itemById(99)
    expect(created?.name).toBe('露营灯')
    expect(created?.status).toBe('available')
    expect(created?.ownerPhone).toBe(OWNER)
    expect(store.visibleItems.some((it) => it.id === 99)).toBe(true)
  })

  it('删除后本地立即消失，滞后读取返回它也不复活', async () => {
    const store = await mountStore(OWNER)
    expect(await store.remove(1)).toBe(true)
    expect(store.itemById(1)).toBeUndefined()

    await vi.advanceTimersByTimeAsync(5000)
    expect(store.itemById(1)).toBeUndefined()
  })
})

describe('下架', () => {
  it('下架后从公开列表隐藏，滞后的在架状态不覆盖', async () => {
    const store = await mountStore(OWNER)
    expect(await store.setArchived(1, true)).toBe(true)
    await flushAsync()
    expect(store.itemById(1)?.archived).toBe(true)
    expect(store.visibleItems).toHaveLength(0)
    expect(store.myItems).toHaveLength(1)
  })
})

describe('点击守卫：拒绝要有反馈、失败要解锁，且不发无效请求', () => {
  const draft = {
    name: '露营灯',
    desc: 'LED',
    contactType: 'phone' as const,
    contact: OWNER,
    imgUrl: '',
    category: 'tools' as const,
    position: null,
  }

  it('未登录点借用：提示先登录，不发 POST，状态与 writing 不变', async () => {
    const store = await mountStore('')
    expect(await store.borrow(1)).toBe(false)
    expect(apiMock.borrow).not.toHaveBeenCalled()
    expect(store.itemById(1)?.status).toBe('available')
    expect(store.writing).toBe(false)
    expect(toastTitles()).toContain('请先登录')
  })

  it('未登录点发布：提示先登录，不发 POST', async () => {
    const store = await mountStore('')
    expect(await store.publish(draft)).toBe(false)
    expect(apiMock.publish).not.toHaveBeenCalled()
    expect(store.itemById(99)).toBeUndefined()
    expect(toastTitles()).toContain('请先登录')
  })

  it('物主借自己发布的物品：拒绝且不发 POST', async () => {
    const store = await mountStore(OWNER)
    expect(await store.borrow(1)).toBe(false)
    expect(apiMock.borrow).not.toHaveBeenCalled()
    expect(store.itemById(1)?.status).toBe('available')
    expect(toastTitles()).toContain('暂时借不了')
  })

  it('已借出 / 已下架再点借用：幂等拒绝，不发 POST', async () => {
    server = [makeItem({ status: 'lent', borrowedBy: '13800000003' })]
    const store = await mountStore(BORROWER)
    expect(await store.borrow(1)).toBe(false)

    server = [makeItem({ archived: true })]
    await store.refresh()
    expect(await store.borrow(1)).toBe(false)

    expect(apiMock.borrow).not.toHaveBeenCalled()
    expect(store.writing).toBe(false)
  })

  it('越权操作（非物主下架 / 非借阅人归还 / 借出中删除）：各自反馈且不发请求', async () => {
    const store = await mountStore(BORROWER)
    expect(await store.setArchived(1, true)).toBe(false)
    expect(apiMock.archive).not.toHaveBeenCalled()
    expect(toastTitles()).toContain('无权操作')

    server = [makeItem({ status: 'lent', borrowedBy: '13800000003' })]
    await store.refresh()
    expect(await store.returnBack(1)).toBe(false)
    expect(apiMock.returnBack).not.toHaveBeenCalled()
    expect(toastTitles()).toContain('无法归还')

    server = [makeItem({ status: 'lent', borrowedBy: BORROWER })]
    await store.refresh()
    expect(await store.remove(1)).toBe(false)
    expect(apiMock.remove).not.toHaveBeenCalled()
    expect(toastTitles()).toContain('无权操作')
    expect(store.itemById(1)).toBeDefined()
  })

  it('物主删除自己借出中的物品：提示先收回，不发请求', async () => {
    server = [makeItem({ status: 'lent', borrowedBy: BORROWER })]
    const store = await mountStore(OWNER)
    expect(await store.remove(1)).toBe(false)
    expect(apiMock.remove).not.toHaveBeenCalled()
    expect(toastTitles()).toContain('无法删除')
    expect(store.itemById(1)?.status).toBe('lent')
  })

  it('POST 失败（代理被墙 / 超时）：状态原样保留、writing 复位、给出原因', async () => {
    const store = await mountStore(BORROWER)
    apiMock.borrow.mockRejectedValueOnce(new Error('网络异常，请稍后再试'))
    expect(await store.borrow(1)).toBe(false)
    expect(store.itemById(1)?.status).toBe('available')
    expect(store.writing).toBe(false)
    expect(toastTitles()).toContain('借用失败')
    expect(toast.toasts.at(-1)?.msg).toContain('网络异常')
    // 失败的写入不能进入待对账，否则会把假状态锁在列表里
    await store.refresh()
    expect(store.itemById(1)?.status).toBe('available')
  })

  it('失败后再点一次仍能成功（按钮不会被永久锁死）', async () => {
    const store = await mountStore(BORROWER)
    apiMock.borrow.mockRejectedValueOnce(new Error('服务暂时不可用'))
    expect(await store.borrow(1)).toBe(false)
    expect(await store.borrow(1)).toBe(true)
    expect(store.itemById(1)?.status).toBe('lent')
    expect(store.writing).toBe(false)
  })

  it('请求进行中连点两次：只发一次 POST', async () => {
    const store = await mountStore(BORROWER)
    let resolvePost: ((v: { ok: boolean }) => void) | undefined
    apiMock.borrow.mockImplementation(() => new Promise((r) => (resolvePost = r)))

    const first = store.borrow(1)
    await flushAsync()
    expect(store.writing).toBe(true)
    expect(await store.borrow(1)).toBe(false)

    resolvePost?.({ ok: true })
    expect(await first).toBe(true)
    expect(apiMock.borrow).toHaveBeenCalledTimes(1)
    expect(store.writing).toBe(false)
  })

  it('物品不在列表里（首屏未加载完 / 已被别人删掉）：提示而不是静默忽略', async () => {
    const store = await mountStore(BORROWER)
    expect(await store.borrow(999)).toBe(false)
    expect(await store.returnBack(999)).toBe(false)
    expect(await store.setArchived(999, true)).toBe(false)
    expect(await store.remove(999)).toBe(false)

    expect(apiMock.borrow).not.toHaveBeenCalled()
    expect(apiMock.returnBack).not.toHaveBeenCalled()
    expect(apiMock.archive).not.toHaveBeenCalled()
    expect(apiMock.remove).not.toHaveBeenCalled()
    expect(toastTitles().filter((t) => t === '稍等一下')).toHaveLength(4)
    expect(store.writing).toBe(false)
  })
})
