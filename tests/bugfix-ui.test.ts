// ================================================
// tests/bugfix-ui.test.ts — 本轮 bug 修复的 UI 回归
//
// 1) MinePage：名下有收费物品时，物品列表被 v-if/v-else 吞掉（上下架/删除入口全消失）
// 2) DetailPage：深链/刷新直接打开时先闪「没有这件物品」
// 3) DetailPage：已下架物品的联系方式对陌生人也照常显示（页面却写着「仅发布者可见」）
// 4) MyPanel：游客完全没有 /mine、/borrows 的入口
// ================================================

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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
    adminReset: vi.fn(),
  },
}))

import { listItems } from '@/lib/github'
import MinePage from '@/pages/MinePage.vue'
import DetailPage from '@/pages/DetailPage.vue'
import MyPanel from '@/components/MyPanel.vue'

const OWNER_PHONE = '13800000001'
const OWNER_HASH = 'hash-13800000001'
const STRANGER_HASH = 'hash-13800000009'

/** 构造测试用 JWT（auth store 只检查过期和提取 phoneHash，不验证签名） */
function makeJwt(phoneHash: string, expOffsetSec = 86400): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  const now = Math.floor(Date.now() / 1000)
  return [b64({ alg: 'HS256' }), b64({ phoneHash, iat: now, exp: now + expOffsetSec }), 'sig'].join('.')
}

function loginAs(hash: string | null): void {
  localStorage.clear()
  if (hash) localStorage.setItem('linli_haowu_token_v2', makeJwt(hash))
}

function makeItem(partial: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: '博世冲击钻',
    desc: '九成新',
    contactType: 'phone',
    contact: '13800000001',
    imgUrl: '',
    status: 'available',
    ownerHash: OWNER_HASH,
    lat: null,
    lng: null,
    category: 'tools',
    rentType: 'free',
    rentFee: 0,
    createTime: '2026-09-01T00:00:00.000Z',
    archived: false,
    ...partial,
  }
}

let server: Item[] = []

/** 统一给页面挂一个真实 router（RouterLink 打桩会吞掉链接内文字，断言就读不到物品名） */
async function makeRouter(path = '/') {
  const stub = { template: '<div></div>' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/publish', component: stub },
      { path: '/mine', component: stub },
      { path: '/borrows', component: stub },
      { path: '/items/:id', component: DetailPage },
    ],
  })
  await router.push(path)
  await router.isReady()
  return router
}

async function mountPage(page: unknown, path = '/') {
  const router = await makeRouter(path)
  return mount(page as never, { global: { plugins: [router], stubs: { Teleport: true } } })
}

async function mountDetailPage() {
  const router = await makeRouter('/items/1')
  const w = mount(DetailPage, { global: { plugins: [router], stubs: { Teleport: true } } })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  server = [makeItem()]
  vi.mocked(listItems).mockImplementation(async () => server.map((it) => ({ ...it })))
})

describe('我的发布：收费物品不能让列表消失', () => {
  it('名下有「按天计费」物品时，列表与租金统计同时可见', async () => {
    loginAs(OWNER_HASH)
    server = [makeItem({ rentType: 'daily', rentFee: 5 })]
    const w = await mountPage(MinePage, '/mine')
    await flushPromises()

    // 租金统计条
    expect(w.text()).toContain('租金收入')
    // 关键回归：物品行必须还在（以前被 v-else 吞掉，删除/上下架入口一起消失）
    expect(w.text()).toContain('博世冲击钻')
    const buttons = w.findAll('button').map((b) => b.text())
    expect(buttons).toContain('下架')
    expect(buttons).toContain('删除')
  })

  it('纯免费物品时行为不变（有统计才显示统计条，列表始终在）', async () => {
    loginAs(OWNER_HASH)
    server = [makeItem()]
    const w = await mountPage(MinePage, '/mine')
    await flushPromises()
    expect(w.text()).not.toContain('租金收入')
    expect(w.text()).toContain('博世冲击钻')
  })
})

describe('详情页：加载中不要误报「没有这件物品」', () => {
  it('列表还没读到时显示加载态', async () => {
    loginAs(null)
    // 永不 resolve：模拟慢网络 / 深链首屏
    vi.mocked(listItems).mockImplementation(() => new Promise(() => {}))
    const router = await makeRouter('/items/1')
    const w = mount(DetailPage, { global: { plugins: [router], stubs: { Teleport: true } } })
    await flushPromises()

    expect(w.text()).toContain('正在加载这件物品')
    expect(w.text()).not.toContain('没有这件物品')
  })

  it('列表读完确实没有：才显示未找到', async () => {
    loginAs(null)
    server = []
    const w = await mountDetailPage()
    expect(w.text()).toContain('没有这件物品')
  })
})

describe('详情页：已下架物品的联系方式只给物主看', () => {
  it('非物主打开已下架物品：看不到手机号', async () => {
    loginAs(STRANGER_HASH)
    server = [makeItem({ archived: true, contact: '13800000001' })]
    const w = await mountDetailPage()

    expect(w.text()).toContain('已下架')
    expect(w.text()).toContain('仅发布者可见')
    expect(w.text()).not.toContain('13800000001')
  })

  it('物主自己看已下架物品：联系方式照常显示（方便自己核对）', async () => {
    loginAs(OWNER_HASH)
    server = [makeItem({ archived: true, contact: '13800000001' })]
    const w = await mountDetailPage()
    expect(w.text()).toContain('13800000001')
  })
})

describe('我的入口：游客也能到达', () => {
  it('未登录也渲染「我的发布 / 我的借用」入口', async () => {
    loginAs(null)
    const router = await makeRouter('/')
    const w = mount(MyPanel, { global: { plugins: [router] } })
    await flushPromises()
    expect(w.text()).toContain('我的发布')
    expect(w.text()).toContain('我的借用')
    expect(w.html()).toContain('/mine')
    expect(w.html()).toContain('/borrows')
  })
})
