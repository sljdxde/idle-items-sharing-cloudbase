// ================================================
// tests/paged-list.test.ts — 首页切片渲染（无限滚动）
// 背景：列表数据一次读全（搜索/分类/距离排序都要完整数组），卡顿来自
// 「几十张卡片 + 内嵌 base64 图片同时进 DOM」。所以只切渲染，不切数据。
// 这里用手写 IntersectionObserver 桩，避免依赖 happy-dom 的定位/观察实现。
// ================================================

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

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
import { useItemsStore } from '@/stores/items'
import { usePagedList, type PagedListOptions } from '@/composables/usePagedList'
import type { Item } from '@/lib/types'
import HomePage from '@/pages/HomePage.vue'
import ItemCard from '@/components/ItemCard.vue'

class FakeIO {
  static instances: FakeIO[] = []
  targets: Element[] = []
  disconnects = 0

  constructor(private cb: IntersectionObserverCallback) {
    FakeIO.instances.push(this)
  }

  observe(el: Element): void {
    this.targets.push(el)
  }

  unobserve(el: Element): void {
    this.targets = this.targets.filter((t) => t !== el)
  }

  disconnect(): void {
    this.disconnects += 1
    this.targets = []
  }

  /** 模拟哨兵滚入视口 */
  enter(): void {
    this.cb(
      this.targets.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    )
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

type Paged<T> = ReturnType<typeof usePagedList<T>>

function mountList<T>(source: Ref<T[]>, opts: PagedListOptions = {}): { w: ReturnType<typeof mount>; api: Paged<T> } {
  let api!: Paged<T>
  const Comp = defineComponent({
    setup() {
      api = usePagedList(() => source.value, opts)
      return () =>
        h('div', [
          h('span', { class: 'count' }, String(api.visible.value.length)),
          h('i', {
            class: 'sentinel',
            ref: (el: unknown) => {
              api.sentinel.value = el as HTMLElement | null
            },
          }),
        ])
    },
  })
  const w = mount(Comp)
  return { w, api }
}

beforeEach(() => {
  FakeIO.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIO)
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePagedList 切片逻辑', () => {
  it('首屏只渲染 pageSize 条，之后按页追加到全部', async () => {
    const { w, api } = mountList(ref(range(30)), { pageSize: 12 })
    await nextTick()
    expect(api.visible.value).toHaveLength(12)
    expect(api.hasMore.value).toBe(true)

    api.loadMore()
    expect(api.visible.value).toHaveLength(24)
    api.loadMore()
    expect(api.visible.value).toHaveLength(30)
    expect(api.hasMore.value).toBe(false)
    w.unmount()
  })

  it('不足一页时没有「下一页」可言', async () => {
    const { api } = mountList(ref(range(5)), { pageSize: 12 })
    await nextTick()
    expect(api.visible.value).toHaveLength(5)
    expect(api.hasMore.value).toBe(false)
  })

  it('触底后再点不会把 shown 推过头', async () => {
    const { api } = mountList(ref(range(13)), { pageSize: 12 })
    await nextTick()
    api.loadMore()
    api.loadMore()
    expect(api.shown.value).toBe(24)
    expect(api.visible.value).toHaveLength(13)
  })

  it('筛选条件变化回到第一页（否则用户会看到对不上筛选的半截列表）', async () => {
    const filter = ref('all')
    const { api } = mountList(ref(range(50)), { pageSize: 12, resetOn: () => filter.value })
    await nextTick()
    api.loadMore()
    expect(api.visible.value).toHaveLength(24)

    filter.value = 'tools'
    await nextTick()
    expect(api.visible.value).toHaveLength(12)
  })

  it('写后对账只是重建数组，不该把用户弹回第一页', async () => {
    const source = ref(range(50))
    const { api } = mountList(source, { pageSize: 12 })
    await nextTick()
    api.loadMore()

    source.value = [...source.value] // 新数组、同样长度：列表被重新读取
    await nextTick()
    expect(api.visible.value).toHaveLength(24)
  })

  it('列表被筛短后渲染不越界', async () => {
    const source = ref(range(50))
    const { api } = mountList(source, { pageSize: 12 })
    await nextTick()
    api.loadMore()
    source.value = range(3)
    await nextTick()
    expect(api.visible.value).toHaveLength(3)
    expect(api.hasMore.value).toBe(false)
  })

  it('挂载时把哨兵交给 IntersectionObserver，卸载时断开（不泄漏观察器）', async () => {
    const { w, api } = mountList(ref(range(30)), { pageSize: 12 })
    await flushPromises()
    expect(FakeIO.instances).toHaveLength(1)
    expect(FakeIO.instances[0].targets).toContain(w.find('.sentinel').element)

    w.unmount()
    expect(FakeIO.instances[0].disconnects).toBeGreaterThan(0)
    void api
  })

  it('哨兵进入视口自动追加下一页', async () => {
    const { w, api } = mountList(ref(range(30)), { pageSize: 12 })
    await flushPromises()
    FakeIO.instances[0].enter()
    await nextTick()
    expect(api.visible.value).toHaveLength(24)
    w.unmount()
  })

  it('全部加载完后，哨兵继续可见也不会再追加', async () => {
    const { w, api } = mountList(ref(range(13)), { pageSize: 12 })
    await flushPromises()
    FakeIO.instances[0].enter()
    await nextTick()
    const before = api.shown.value
    FakeIO.instances[0].enter()
    await nextTick()
    expect(api.shown.value).toBe(before)
    w.unmount()
  })

  it('无 IntersectionObserver 的环境不报错，交给「加载更多」按钮', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { w, api } = mountList(ref(range(30)), { pageSize: 12 })
    await flushPromises()
    expect(FakeIO.instances).toHaveLength(0)
    api.loadMore()
    expect(api.visible.value).toHaveLength(24)
    w.unmount()
  })
})

// ---------- 首页接线 ----------

function makeItem(id: number): Item {
  return {
    id,
    name: `好物 ${id}`,
    desc: '',
    contactType: 'phone',
    contact: '13800000001',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000001',
    lat: null,
    lng: null,
    category: 'tools',
    createTime: new Date(2026, 0, 1 + (30 - id)).toISOString(),
    archived: false,
  }
}

async function mountHome(count: number) {
  vi.mocked(listItems).mockImplementation(async () =>
    Array.from({ length: count }, (_, i) => makeItem(i + 1)),
  )
  const w = mount(HomePage, { global: { stubs: { RouterLink: true, Teleport: true } } })
  await flushPromises()
  await flushPromises()
  return w
}

const moreBtn = (w: ReturnType<typeof mount>) =>
  w.findAll('button').find((b) => b.text().trim().startsWith('加载更多'))

describe('首页无限滚动接线', () => {
  it('30 件物品首屏只渲染 12 张卡，但总数文案仍是全量（共 30 件）', async () => {
    const w = await mountHome(30)
    expect(w.findAll('.grid-cell')).toHaveLength(12)
    expect(w.text()).toContain('共 30 件')
    expect(moreBtn(w)!.text()).toContain('12/30')
  })

  it('点「加载更多」追加下一页，到底后按钮换成「已显示全部」', async () => {
    const w = await mountHome(30)
    await moreBtn(w)!.trigger('click')
    expect(w.findAll('.grid-cell')).toHaveLength(24)

    await moreBtn(w)!.trigger('click')
    expect(w.findAll('.grid-cell')).toHaveLength(30)
    expect(moreBtn(w)).toBeUndefined()
    expect(w.text()).toContain('已显示全部 30 件')
  })

  it('卡片顺序沿用 store 的排序结果（切片不改顺序）', async () => {
    const w = await mountHome(30)
    const store = useItemsStore()
    const rendered = w.findAllComponents(ItemCard).map((c) => c.props('item')!.id)
    expect(rendered).toEqual(store.visibleItems.slice(0, 12).map((it) => it.id))
    expect(rendered[0]).toBe(store.visibleItems[0].id)
  })

  it('滚动到底自动补页（IntersectionObserver 可用时不必点按钮）', async () => {
    const w = await mountHome(30)
    FakeIO.instances.at(-1)!.enter()
    await nextTick()
    expect(w.findAll('.grid-cell')).toHaveLength(24)
  })

  it('物品不足一页时既没有按钮也不喊「已显示全部」', async () => {
    const w = await mountHome(5)
    expect(w.findAll('.grid-cell')).toHaveLength(5)
    expect(moreBtn(w)).toBeUndefined()
    expect(w.text()).not.toContain('已显示全部')
  })

  it('改筛选条件后回到第一页，总数文案按筛选结果更新', async () => {
    const w = await mountHome(30)
    await moreBtn(w)!.trigger('click')
    expect(w.findAll('.grid-cell')).toHaveLength(24)

    // 「好物」命中全部 30 件：数量没变，但筛选条件变了 → 必须回到第一页
    useItemsStore().search = '好物'
    await flushPromises()
    expect(w.findAll('.grid-cell')).toHaveLength(12)
    expect(w.text()).toContain('共 30 件')

    useItemsStore().search = '7'
    await flushPromises()
    expect(w.findAll('.grid-cell')).toHaveLength(3)
    expect(w.text()).toContain('共 3 件')
    expect(moreBtn(w)).toBeUndefined()
  })
})
