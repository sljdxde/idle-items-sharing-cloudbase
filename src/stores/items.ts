// ================================================
// src/stores/items.ts — 全局数据与筛选状态（Pinia）
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '@/lib/api'
import type { CategoryId, Item } from '@/lib/types'
import { filterItems } from '@/lib/filters'

export type RangeOption = 500 | 1000 | 3000 | 0
export const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: 500, label: '500m' },
  { value: 1000, label: '1km' },
  { value: 3000, label: '3km' },
  { value: 0, label: '全部' },
]

export type LocateStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unsupported'

export const useItemsStore = defineStore('items', () => {
  // ─── 数据 ───
  const items = ref<Item[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  async function load(forceLive = false): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      items.value = await api.list({ forceLive })
      loaded.value = true
    } catch (e) {
      error.value = (e as Error).message || '加载失败'
    } finally {
      loading.value = false
    }
  }

  // ─── 定位 ───
  const userLoc = ref<{ lat: number; lng: number } | null>(null)
  const locateStatus = ref<LocateStatus>('idle')

  // ─── 筛选 ───
  const search = ref('')
  const category = ref<CategoryId | 'all'>('all')
  const rangeMeters = ref<RangeOption>(1000)

  function setRange(v: RangeOption): void {
    rangeMeters.value = v
  }
  function setCategory(v: CategoryId | 'all'): void {
    category.value = v
  }

  const visibleItems = computed(() =>
    filterItems(items.value, {
      category: category.value,
      search: search.value,
      rangeMeters: rangeMeters.value,
      user: userLoc.value,
    }),
  )

  function itemById(id: number): Item | undefined {
    return items.value.find((it) => it.id === id)
  }

  return {
    items,
    loading,
    loaded,
    error,
    load,
    userLoc,
    locateStatus,
    search,
    category,
    rangeMeters,
    setRange,
    setCategory,
    visibleItems,
    itemById,
  }
})
