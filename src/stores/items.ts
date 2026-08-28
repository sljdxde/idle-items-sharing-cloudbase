// ================================================
// src/stores/items.ts — 物品与筛选的全局状态（Pinia）
// 数据源：GitHub Issues（零服务器、零写凭证）。读取经 items.json 快照 + 实时 API 兜底。
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CategoryId, Item } from '@/lib/types'
import { issueUrl, listItems, buildPublishUrl, type PublishDraft } from '@/lib/github'
import { matchesCategory, matchesSearch } from '@/lib/filters'
import { useToast } from '@/composables/useToast'

export { issueUrl }
export type { PublishDraft }

export const useItemsStore = defineStore('items', () => {
  const toast = useToast()

  // ---------- state ----------
  const items = ref<Item[]>([])
  const search = ref('')
  const category = ref<CategoryId | 'all'>('all')
  const loading = ref(false)

  // ---------- 加载（异步，GitHub Issues）----------
  async function load(): Promise<void> {
    loading.value = true
    try {
      items.value = await listItems()
    } catch {
      if (items.value.length === 0) items.value = []
    } finally {
      loading.value = false
    }
  }

  /** 强制重新拉取（绕过本地缓存与快照） */
  function refresh(): void {
    load()
  }

  // ---------- 派生 ----------
  /** 在架物品：未下架 + 分类/搜索过滤 + 最新优先 */
  const visibleItems = computed(() =>
    items.value
      .filter((it) => !it.archived)
      .filter((it) => matchesCategory(it, category.value))
      .filter((it) => matchesSearch(it, search.value))
      .sort(
        (a, b) =>
          new Date(b.createTime).getTime() - new Date(a.createTime).getTime() || b.id - a.id,
      ),
  )

  function itemById(id: number): Item | undefined {
    return items.value.find((it) => it.id === id)
  }

  function setCategory(id: CategoryId | 'all'): void {
    category.value = id
  }

  function setSearch(q: string): void {
    search.value = q
  }

  // ---------- 发布（跳转到预填的 GitHub Issue 创建页）----------
  async function publish(draft: PublishDraft): Promise<void> {
    const url = buildPublishUrl(draft)
    const w = window.open(url, '_blank')
    if (!w) {
      toast.warning('弹窗被拦截', '请允许本站点弹出窗口后重试')
    } else {
      toast.success('已打开 GitHub', '登录并提交后，物品将在几秒内自动上架')
    }
  }

  return {
    items,
    search,
    category,
    loading,
    load,
    refresh,
    visibleItems,
    itemById,
    setCategory,
    setSearch,
    publish,
  }
})
