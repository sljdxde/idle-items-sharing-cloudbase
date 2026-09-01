// ================================================
// src/composables/usePagedList.ts — 长列表切片渲染
// 数据仍是一次读取拿全（搜索、分类、距离排序都依赖完整数组），
// 这里只控制「同一时刻往 DOM 里塞多少张卡」，避免几十张卡片 + base64 图片同时解码造成卡顿。
// 无 IntersectionObserver 的环境不报错：页面自带「加载更多」按钮兜底。
// ================================================

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface PagedListOptions {
  /** 每页条数（默认 12：两列布局约 6 行，首屏足够轻） */
  pageSize?: number
  /** 返回值变化即回到第一页 —— 传筛选条件，别传列表本身（写后对账会重建数组） */
  resetOn?: () => unknown
  /** 视口外扩距离：提前一屏开始预加载，滚动时不出现空白 */
  rootMargin?: string
}

export function usePagedList<T>(source: () => T[], opts: PagedListOptions = {}) {
  const pageSize = opts.pageSize ?? 12
  const all = computed(source)
  const shown = ref(pageSize)
  const sentinel = ref<HTMLElement | null>(null)

  const visible = computed(() => all.value.slice(0, shown.value))
  const hasMore = computed(() => shown.value < all.value.length)

  function loadMore(): void {
    if (hasMore.value) shown.value += pageSize
  }

  function reset(): void {
    shown.value = pageSize
  }

  const resetKey = opts.resetOn
  if (resetKey) watch(resetKey, reset)

  let io: IntersectionObserver | null = null

  /** 每次追加后重新观察：哨兵仍在视口内（大屏 + 矮卡片）就继续补，直到它离开视口或加载完 */
  function reobserve(): void {
    if (!io) return
    io.disconnect()
    if (sentinel.value) io.observe(sentinel.value)
  }

  onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') return
    io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || !hasMore.value) return
        loadMore()
        void nextTick(reobserve)
      },
      { rootMargin: opts.rootMargin ?? '240px 0px' },
    )
    reobserve()
  })

  watch(sentinel, reobserve)

  onBeforeUnmount(() => {
    io?.disconnect()
    io = null
  })

  return { all, visible, shown, hasMore, pageSize, sentinel, loadMore, reset }
}
