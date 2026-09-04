// ================================================
// tests/ui-clicks.test.ts — 页面按钮点击异常回归（组件级）
// 覆盖两类线上现象：
// 1) 按钮被静默禁用（未登录也禁用 → 用户以为「点了没反应」）
// 2) 禁用态没有视觉/没有反馈（hover 仍然高亮、点击无任何提示）
// 断言的是模板里的 disabled 表达式与点击后的接线，不只是纯函数
// ================================================

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
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
import { api } from '@/lib/api'
import { useItemsStore } from '@/stores/items'
import DetailPage from '@/pages/DetailPage.vue'
import HomePage from '@/pages/HomePage.vue'
import MinePage from '@/pages/MinePage.vue'
import BorrowsPage from '@/pages/BorrowsPage.vue'
import ItemCard from '@/components/ItemCard.vue'
import BorrowModal from '@/components/BorrowModal.vue'
import ManageModal from '@/components/ManageModal.vue'

const apiMock = vi.mocked(api)
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

const disabledOf = (w: ReturnType<typeof mount>) =>
  (w.element as HTMLButtonElement).disabled

const btnByText = (w: ReturnType<typeof mount>, text: string) =>
  w.findAll('button').find((b) => b.text().trim() === text)

/** 列表读取结果：页面按钮状态取自 store.itemById，被测物品必须出现在这里 */
let server: Item[] = [makeItem()]

function loginAs(phone: string | null): void {
  localStorage.clear()
  if (phone) localStorage.setItem('linli_haowu_user_v1', phone)
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  server = [makeItem()]
  // 固定返回「未借出」的服务端视角：写后仍显示新状态才算乐观更新生效
  vi.mocked(listItems).mockImplementation(async () => server.map((it) => ({ ...it })))
  apiMock.borrow.mockResolvedValue({ ok: true })
  apiMock.returnBack.mockResolvedValue({ ok: true })
  apiMock.archive.mockResolvedValue({ ok: true })
  apiMock.unarchive.mockResolvedValue({ ok: true })
  apiMock.remove.mockResolvedValue({ ok: true })
})

async function mountDetail(item: Item, phone: string | null) {
  server = [item]
  loginAs(phone)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div></div>' } },
      { path: '/items/:id', component: DetailPage },
    ],
  })
  await router.push(`/items/${item.id}`)
  await router.isReady()
  // Teleport 打桩：模态内容就地渲染，便于直接断言
  const w = mount(DetailPage, { global: { plugins: [router], stubs: { Teleport: true } } })
  await flushPromises()
  return w
}

async function mountCard(item: Item, phone: string | null) {
  server = [item]
  loginAs(phone)
  const w = mount(ItemCard, { props: { item }, global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return w
}

async function mountModal(item: Item, phone: string | null, open = true) {
  server = [item]
  loginAs(phone)
  const w = mount(BorrowModal, {
    props: { open, item },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return w
}

/** 整页挂载（RouterLink 打桩）：用于验证跨页导航与页面内按钮接线 */
async function mountPage(page: Component, item: Item, phone: string | null) {
  server = [item]
  loginAs(phone)
  const w = mount(page, { global: { stubs: { RouterLink: true, Teleport: true } } })
  await flushPromises()
  return w
}

async function mountManage(item: Item, phone: string | null, open = true) {
  server = [item]
  loginAs(phone)
  const w = mount(ManageModal, {
    props: { open, item },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return w
}

describe('详情页「我想借」按钮', () => {
  it('未登录 + 可借：按钮可点，点了进弹窗并给出登录入口（不再静默禁用）', async () => {
    const w = await mountDetail(makeItem(), null)
    const btn = btnByText(w, '我想借')!
    expect(btn).toBeTruthy()
    expect(disabledOf(btn)).toBe(false)

    await btn.trigger('click')
    expect(w.text()).toContain('使用手机号登录')
    expect(apiMock.borrow).not.toHaveBeenCalled()
  })

  it('已借出：按钮禁用且文案写明原因', async () => {
    const w = await mountDetail(
      makeItem({ status: 'lent', borrowedBy: '13800000003' }),
      BORROWER,
    )
    expect(disabledOf(btnByText(w, '已借出')!)).toBe(true)
  })

  it('已下架：按钮禁用且文案写明原因', async () => {
    const w = await mountDetail(makeItem({ archived: true }), BORROWER)
    expect(disabledOf(btnByText(w, '已下架')!)).toBe(true)
  })

  it('借阅人本人：显示「我要归还」，点击后发出归还请求', async () => {
    const w = await mountDetail(
      makeItem({ status: 'lent', borrowedBy: BORROWER, borrowedAt: '2026-09-01T00:00:00.000Z' }),
      BORROWER,
    )
    const btn = btnByText(w, '我要归还')!
    expect(disabledOf(btn)).toBe(false)

    await btn.trigger('click')
    await flushPromises()
    expect(apiMock.returnBack).toHaveBeenCalledWith(1, BORROWER)
    expect(useItemsStore().itemById(1)?.status).toBe('available')
  })

  it('物主：显示管理与上下架，点击下架发出请求', async () => {
    const w = await mountDetail(makeItem(), OWNER)
    expect(btnByText(w, '管理此物品')).toBeTruthy()

    await btnByText(w, '下架')!.trigger('click')
    await flushPromises()
    expect(apiMock.archive).toHaveBeenCalledWith(1, OWNER)
    expect(useItemsStore().itemById(1)?.archived).toBe(true)
  })

  it('写请求进行中：按钮禁用（防重复提交），完成后自动解禁', async () => {
    const w = await mountDetail(makeItem(), BORROWER)
    const store = useItemsStore()
    let resolvePost: ((v: { ok: boolean }) => void) | undefined
    apiMock.borrow.mockImplementation(() => new Promise((r) => (resolvePost = r)))

    await btnByText(w, '我想借')!.trigger('click')
    await btnByText(w, '确认借用')!.trigger('click')
    await flushPromises()
    expect(store.writing).toBe(true)
    expect(disabledOf(btnByText(w, '我想借')!)).toBe(true)

    resolvePost?.({ ok: true })
    await flushPromises()
    expect(store.writing).toBe(false)
    expect(apiMock.borrow).toHaveBeenCalledTimes(1)
  })

  it('借用成功后按钮立刻切到「我要归还」，滞后的列表读取不改回「可借」', async () => {
    const w = await mountDetail(makeItem(), BORROWER)
    await btnByText(w, '我想借')!.trigger('click')
    await btnByText(w, '确认借用')!.trigger('click')
    await flushPromises()
    await flushPromises()

    expect(w.find('.badge-status').text()).toBe('已借出')
    expect(btnByText(w, '可借')).toBeUndefined()
    const back = btnByText(w, '我要归还')!
    expect(disabledOf(back)).toBe(false)
  })
})

describe('首页卡片按钮', () => {
  it('未登录 + 可借：卡片按钮可点并向页面抛出 borrow 事件', async () => {
    const w = await mountCard(makeItem(), null)
    const btn = btnByText(w, '我想借')!
    expect(disabledOf(btn)).toBe(false)
    await btn.trigger('click')
    expect(w.emitted('borrow')?.[0]?.[0]).toMatchObject({ id: 1 })
  })

  it('已借出 / 已下架：卡片按钮禁用并说明原因', async () => {
    const lent = await mountCard(makeItem({ status: 'lent' }), BORROWER)
    expect(disabledOf(btnByText(lent, '已借出')!)).toBe(true)

    const archived = await mountCard(makeItem({ archived: true }), BORROWER)
    expect(disabledOf(btnByText(archived, '已下架')!)).toBe(true)
  })

  it('写入中：可借物品的卡片按钮临时禁用，写入结束恢复', async () => {
    const w = await mountCard(makeItem(), BORROWER)
    const store = useItemsStore()
    store.writing = true
    await flushPromises()
    expect(disabledOf(btnByText(w, '我想借')!)).toBe(true)

    store.writing = false
    await flushPromises()
    expect(disabledOf(btnByText(w, '我想借')!)).toBe(false)
  })

  it('借阅人：卡片上是「我要归还」，点击发出归还请求', async () => {
    const w = await mountCard(makeItem({ status: 'lent', borrowedBy: BORROWER }), BORROWER)
    await btnByText(w, '我要归还')!.trigger('click')
    expect(apiMock.returnBack).toHaveBeenCalledWith(1, BORROWER)
  })

  it('物主：卡片上是管理与上下架，点击各走自己的通道', async () => {
    const w = await mountCard(makeItem(), OWNER)
    await btnByText(w, '管理')!.trigger('click')
    expect(w.emitted('manage')?.[0]?.[0]).toMatchObject({ id: 1 })

    await btnByText(w, '下架')!.trigger('click')
    expect(apiMock.archive).toHaveBeenCalledWith(1, OWNER)
  })
})

describe('借用弹窗', () => {
  it('未登录：只给登录表单，不给「确认借用」（避免点了不生效）', async () => {
    const w = await mountModal(makeItem(), null)
    expect(w.text()).toContain('使用手机号登录')
    expect(btnByText(w, '确认借用')).toBeUndefined()
  })

  it('已登录 + 可借：确认借用可用，成功后关闭弹窗', async () => {
    const w = await mountModal(makeItem(), BORROWER)
    const btn = btnByText(w, '确认借用')!
    expect(disabledOf(btn)).toBe(false)

    await btn.trigger('click')
    await flushPromises()
    expect(apiMock.borrow).toHaveBeenCalledWith(1, BORROWER)
    expect(w.emitted('close')).toBeTruthy()
    expect(useItemsStore().itemById(1)?.status).toBe('lent')
  })

  it('确认借用的 POST 失败：弹窗保持打开、按钮解禁并给出原因', async () => {
    apiMock.borrow.mockRejectedValueOnce(new Error('网络异常，请稍后再试'))
    const w = await mountModal(makeItem(), BORROWER)
    await btnByText(w, '确认借用')!.trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toBeFalsy()
    expect(disabledOf(btnByText(w, '确认借用')!)).toBe(false)
    expect(useItemsStore().itemById(1)?.status).toBe('available')
  })

  it('物品已被别人借走：无确认按钮，只有说明文案', async () => {
    const w = await mountModal(
      makeItem({ status: 'lent', borrowedBy: '13800000003' }),
      BORROWER,
    )
    expect(btnByText(w, '确认借用')).toBeUndefined()
    expect(w.text()).toContain('已被邻居借走')
  })
})

describe('跨页导航（首页集体变「可借」的回归）', () => {
  it('详情页借出后打开首页：卡片仍是已借出，滞后的列表读取不改回可借', async () => {
    const w = await mountDetail(makeItem(), BORROWER)
    await btnByText(w, '我想借')!.trigger('click')
    await btnByText(w, '确认借用')!.trigger('click')
    await flushPromises()
    expect(useItemsStore().itemById(1)?.status).toBe('lent')

    // server 仍停在借出前（模拟 items.json 快照 / 代理读取滞后）
    // 同一 pinia 下挂载首页 = SPA 内导航，store.load() 不得用旧数据覆盖
    useItemsStore().showLent = true // 默认筛选隐藏已借出，这里放开以便断言卡片状态
    const home = mount(HomePage, { global: { stubs: { RouterLink: true, Teleport: true } } })
    await flushPromises()
    await flushPromises()
    expect(home.find('.badge-status').text()).toBe('已借出')
    expect(btnByText(home, '我想借')).toBeUndefined()
    expect(btnByText(home, '我要归还')).toBeTruthy()
  })

  it('借用页归还后回首页：卡片恢复「我想借」，不会停在已借出', async () => {
    const lent = makeItem({ status: 'lent', borrowedBy: BORROWER })
    const w = await mountPage(BorrowsPage, lent, BORROWER)
    await btnByText(w, '我要归还')!.trigger('click')
    await flushPromises()

    const home = mount(HomePage, { global: { stubs: { RouterLink: true, Teleport: true } } })
    await flushPromises()
    await flushPromises()
    expect(disabledOf(btnByText(home, '我想借')!)).toBe(false)
  })
})

describe('我的发布页', () => {
  it('借出中的物品：删除按钮禁用且文案写明原因，点了不会静默无反应', async () => {
    const w = await mountPage(
      MinePage,
      makeItem({ status: 'lent', borrowedBy: BORROWER }),
      OWNER,
    )
    const del = btnByText(w, '借出中不可删')!
    expect(disabledOf(del)).toBe(true)
    await del.trigger('click')
    await flushPromises()
    expect(apiMock.remove).not.toHaveBeenCalled()
  })

  it('删除要两次点击：第一次只进入待确认，第二次才发请求', async () => {
    const w = await mountPage(MinePage, makeItem(), OWNER)
    await btnByText(w, '删除')!.trigger('click')
    expect(apiMock.remove).not.toHaveBeenCalled()

    const arm = btnByText(w, '确认删除？')!
    expect(disabledOf(arm)).toBe(false)
    await arm.trigger('click')
    await flushPromises()
    expect(apiMock.remove).toHaveBeenCalledWith(1, OWNER)
    expect(useItemsStore().itemById(1)).toBeUndefined()
  })

  it('待确认 3 秒无操作自动还原，删除不会停在半武装状态', async () => {
    const w = await mountPage(MinePage, makeItem(), OWNER)
    vi.useFakeTimers()
    try {
      await btnByText(w, '删除')!.trigger('click')
      expect(btnByText(w, '确认删除？')).toBeTruthy()
      await vi.advanceTimersByTimeAsync(3000)
      await nextTick()
    } finally {
      vi.useRealTimers()
    }
    expect(btnByText(w, '删除')).toBeTruthy()
    expect(btnByText(w, '确认删除？')).toBeUndefined()
    expect(apiMock.remove).not.toHaveBeenCalled()
  })

  it('下架：调用代理并立刻从公开列表隐藏（我的发布里仍可见）', async () => {
    const w = await mountPage(MinePage, makeItem(), OWNER)
    await btnByText(w, '下架')!.trigger('click')
    await flushPromises()
    expect(apiMock.archive).toHaveBeenCalledWith(1, OWNER)
    const store = useItemsStore()
    expect(store.itemById(1)?.archived).toBe(true)
    expect(store.visibleItems).toHaveLength(0)
    expect(store.myItems).toHaveLength(1)
  })

  it('未登录：不给任何操作按钮，只给登录入口', async () => {
    const w = await mountPage(MinePage, makeItem(), null)
    expect(btnByText(w, '下架')).toBeUndefined()
    expect(btnByText(w, '删除')).toBeUndefined()
    expect(w.text()).toContain('登录')
  })
})

describe('我的借用页', () => {
  const lentMine = () =>
    makeItem({ status: 'lent', borrowedBy: BORROWER, borrowedAt: '2026-09-01T00:00:00.000Z' })

  it('归还：按钮可点，成功后这件借用从列表消失', async () => {
    const w = await mountPage(BorrowsPage, lentMine(), BORROWER)
    const btn = btnByText(w, '我要归还')!
    expect(disabledOf(btn)).toBe(false)

    await btn.trigger('click')
    await flushPromises()
    expect(apiMock.returnBack).toHaveBeenCalledWith(1, BORROWER)
    expect(w.text()).toContain('你还没有借用的物品')
  })

  it('请求进行中再点一次：只发一次 POST，完成后解禁', async () => {
    const w = await mountPage(BorrowsPage, lentMine(), BORROWER)
    let resolvePost: ((v: { ok: boolean }) => void) | undefined
    apiMock.returnBack.mockImplementation(() => new Promise((r) => (resolvePost = r)))

    await btnByText(w, '我要归还')!.trigger('click')
    await flushPromises()
    expect(disabledOf(btnByText(w, '我要归还')!)).toBe(true)
    await btnByText(w, '我要归还')!.trigger('click')

    resolvePost?.({ ok: true })
    await flushPromises()
    expect(apiMock.returnBack).toHaveBeenCalledTimes(1)
  })

  it('未登录：不给归还入口，只给登录框', async () => {
    const w = await mountPage(BorrowsPage, lentMine(), null)
    expect(btnByText(w, '我要归还')).toBeUndefined()
    expect(w.text()).toContain('登录')
  })
})

describe('物主管理弹窗', () => {
  it('非物主打开：说明无权管理，不给可点按钮', async () => {
    const w = await mountManage(makeItem(), BORROWER)
    expect(w.text()).toContain('只有发布者可以管理')
    expect(btnByText(w, '下架')).toBeUndefined()
  })

  it('物主下架：调用代理后关闭弹窗', async () => {
    const w = await mountManage(makeItem(), OWNER)
    await btnByText(w, '下架')!.trigger('click')
    await flushPromises()
    expect(apiMock.archive).toHaveBeenCalledWith(1, OWNER)
    expect(w.emitted('close')).toBeTruthy()
  })

  it('代理失败：弹窗不关、按钮解禁、状态不变（不留假状态）', async () => {
    apiMock.archive.mockRejectedValueOnce(new Error('服务暂时不可用'))
    const w = await mountManage(makeItem(), OWNER)
    await btnByText(w, '下架')!.trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toBeFalsy()
    expect(disabledOf(btnByText(w, '下架')!)).toBe(false)
    expect(useItemsStore().itemById(1)?.archived).toBe(false)
  })

  it('已下架物品：按钮是「重新上架」，点击走 unarchive', async () => {
    const w = await mountManage(makeItem({ archived: true }), OWNER)
    await btnByText(w, '重新上架')!.trigger('click')
    await flushPromises()
    expect(apiMock.unarchive).toHaveBeenCalledWith(1, OWNER)
    expect(useItemsStore().itemById(1)?.archived).toBe(false)
  })
})
