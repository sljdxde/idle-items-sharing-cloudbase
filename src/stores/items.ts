// ================================================
// src/stores/items.ts — 物品与筛选的全局状态（Pinia）
// 数据源：localStorage（离线自持），无任何网络依赖
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BorrowRequest, CategoryId, Item } from '@/lib/types'
import * as store from '@/lib/localStore'
import { matchesCategory, matchesSearch } from '@/lib/filters'
import { useToast } from '@/composables/useToast'

export interface PublishDraft {
  name: string
  desc: string
  contact: string
  building: string
  imgUrl: string
  category: CategoryId
}

export const useItemsStore = defineStore('items', () => {
  const toast = useToast()

  // ---------- state ----------
  const items = ref<Item[]>([])
  const search = ref('')
  const category = ref<CategoryId | 'all'>('all')

  // ---------- 加载 ----------
  function load(): void {
    items.value = store.loadItems()
  }

  /** 持久化兜底提示 */
  function persist(): void {
    if (!store.saveItems(items.value)) {
      toast.warning('存储空间不足', '本次改动仅在本页生效')
    }
  }

  // ---------- 派生 ----------
  /** 在架物品：未下架 + 分类/搜索过滤 + 最新优先 */
  const visibleItems = computed(() =>
    items.value
      .filter((it) => !it.archived)
      .filter((it) => matchesCategory(it, category.value))
      .filter((it) => matchesSearch(it, search.value))
      .sort((a, b) => b.createTime.localeCompare(a.createTime) || b.id - a.id),
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

  // ---------- 写操作 ----------
  function publish(draft: PublishDraft): Item {
    const item: Item = {
      id: store.nextId(items.value),
      name: draft.name.trim(),
      desc: draft.desc.trim(),
      contact: draft.contact.trim(),
      building: draft.building.trim(),
      imgUrl: draft.imgUrl,
      status: 'available',
      requests: [],
      category: draft.category,
      createTime: new Date().toISOString(),
      archived: false,
    }
    items.value.unshift(item)
    persist()
    return item
  }

  /** 借阅人发起申请 → requested */
  function requestBorrow(id: number, input: Omit<BorrowRequest, 'id' | 'createdAt' | 'status'>): void {
    const it = itemById(id)
    if (!it || it.status === 'borrowed') return
    it.requests.push({
      ...input,
      id: store.uid(),
      createdAt: new Date().toISOString(),
      status: 'pending',
    })
    it.status = 'requested'
    persist()
  }

  /** 物主确认借出 → borrowed */
  function confirmBorrow(id: number, requestId: string): void {
    const it = itemById(id)
    const req = it?.requests.find((r) => r.id === requestId && r.status === 'pending')
    if (!it || !req) return
    req.status = 'accepted'
    it.status = 'borrowed'
    persist()
  }

  /** 物主婉拒；无其他待处理则回退可借 */
  function rejectRequest(id: number, requestId: string): void {
    const it = itemById(id)
    const req = it?.requests.find((r) => r.id === requestId && r.status === 'pending')
    if (!it || !req) return
    req.status = 'rejected'
    if (!it.requests.some((r) => r.status === 'pending')) it.status = 'available'
    persist()
  }

  /** 确认归还 → available（同一 listing 再次上架） */
  function confirmReturn(id: number): void {
    const it = itemById(id)
    if (!it) return
    for (const r of it.requests) {
      if (r.status === 'accepted') r.status = 'returned'
      else if (r.status === 'pending') r.status = 'rejected'
    }
    it.status = 'available'
    persist()
  }

  function setArchived(id: number, archived: boolean): void {
    const it = itemById(id)
    if (!it) return
    it.archived = archived
    persist()
  }

  function removeItem(id: number): void {
    items.value = items.value.filter((it) => it.id !== id)
    persist()
  }

  return {
    items,
    search,
    category,
    load,
    visibleItems,
    itemById,
    setCategory,
    setSearch,
    publish,
    requestBorrow,
    confirmBorrow,
    rejectRequest,
    confirmReturn,
    setArchived,
    removeItem,
  }
})
