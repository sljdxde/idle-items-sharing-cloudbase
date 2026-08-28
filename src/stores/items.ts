// ================================================
// src/stores/items.ts — 物品与筛选的全局状态（Pinia）
// 数据源：localStorage 本地持久层（发布/借阅/归还/上下架全在本地完成）
// 用户体系：登录手机号区分物主与借阅者（stores/auth.ts）
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CategoryId, ContactType, Item } from '@/lib/types'
import { loadItems, saveItems, nextId } from '@/lib/localStore'
import { matchesCategory, matchesRadius, matchesSearch } from '@/lib/filters'
import {
  borrowItem as borrowOp,
  canBorrow,
  canReturn,
  isOwner,
  returnItem as returnOp,
} from '@/lib/itemOps'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import {
  DEFAULT_RADIUS_KM,
  distanceKm,
  formatDistance,
  getBrowserLocation,
  itemLatLng,
  type LatLng,
} from '@/lib/geo'

export interface PublishDraft {
  name: string
  desc: string
  contactType: ContactType
  contact: string
  imgUrl: string
  category: CategoryId
  /** 发布时自动获取的用户定位；获取失败为 null */
  position: LatLng | null
}

const POS_KEY = 'linli_haowu_pos_v1'

function readStoredPos(): LatLng | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng)
      ? { lat: p.lat, lng: p.lng }
      : null
  } catch {
    return null
  }
}

export const useItemsStore = defineStore('items', () => {
  const toast = useToast()
  const auth = useAuthStore()

  // ---------- state ----------
  const items = ref<Item[]>([])
  const search = ref('')
  const category = ref<CategoryId | 'all'>('all')
  /** 距离筛选半径（km，可配置参数 x）；'all' = 不限距离 */
  const radiusKm = ref<number | 'all'>(DEFAULT_RADIUS_KM)
  /** 默认隐藏已借出物品；打开后在列表中展示并标记状态 */
  const showLent = ref(false)
  /** 只看我的发布（含已下架，便于重新上架） */
  const onlyMine = ref(false)
  /** 当前用户定位 */
  const userPosition = ref<LatLng | null>(null)
  const locating = ref(false)

  // ---------- 加载（本地数据，同步即可） ----------
  function load(): void {
    items.value = loadItems()
    userPosition.value = readStoredPos()
  }
  load()

  function persist(): void {
    saveItems(items.value)
  }

  /** 重新获取定位（发布页/工具栏的「定位」按钮） */
  async function locate(): Promise<boolean> {
    locating.value = true
    const pos = await getBrowserLocation()
    locating.value = false
    if (pos) {
      userPosition.value = pos
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos))
      } catch {
        /* ignore */
      }
      return true
    }
    return false
  }

  /** 物品到当前用户的距离（km）；无法计算返回 null */
  function distanceOf(item: Item): number | null {
    const p = itemLatLng(item)
    if (!p || !userPosition.value) return null
    return distanceKm(userPosition.value, p)
  }

  /** 卡片/详情页用的距离文案 */
  function distanceLabel(item: Item): string | null {
    const d = distanceOf(item)
    return d === null ? null : formatDistance(d)
  }

  // ---------- 派生：可见列表 ----------
  const visibleItems = computed(() =>
    items.value
      // 下架不可见；但「我的发布」里物主可见自己的下架物品（可重新上架）
      .filter(
        (it) =>
          !it.archived ||
          (onlyMine.value && !!auth.phone && it.ownerPhone === auth.phone),
      )
      .filter((it) =>
        onlyMine.value && auth.phone ? it.ownerPhone === auth.phone : true,
      )
      .filter((it) => matchesCategory(it, category.value))
      .filter((it) => matchesSearch(it, search.value))
      // 默认不展示已借出物品；打开开关后展示并标记
      .filter((it) => (showLent.value ? true : it.status === 'available'))
      .filter((it) => matchesRadius(it, userPosition.value, radiusKm.value))
      // 用户已定位时按距离升序（无定位物品排最后），否则最新优先
      .sort((a, b) => {
        if (userPosition.value) {
          const da = distanceOf(a)
          const db = distanceOf(b)
          if (da !== null && db !== null) return da - db
          if (da !== null) return -1
          if (db !== null) return 1
        }
        return (
          new Date(b.createTime).getTime() - new Date(a.createTime).getTime() ||
          b.id - a.id
        )
      }),
  )

  function itemById(id: number): Item | undefined {
    return items.value.find((it) => it.id === id)
  }

  // ---------- 发布（自动携带定位） ----------
  function publish(draft: PublishDraft): boolean {
    if (!auth.phone) {
      toast.error('请先登录', '发布闲置需要先登录')
      return false
    }
    const item: Item = {
      id: nextId(items.value),
      name: draft.name.trim(),
      desc: draft.desc.trim(),
      contactType: draft.contactType,
      contact: draft.contact.trim(),
      imgUrl: draft.imgUrl.trim(),
      status: 'available',
      ownerPhone: auth.phone,
      lat: draft.position?.lat ?? null,
      lng: draft.position?.lng ?? null,
      category: draft.category,
      createTime: new Date().toISOString(),
    }
    items.value.unshift(item)
    persist()
    toast.success(
      '发布成功',
      draft.position ? '已带上你的定位，附近邻居能按距离找到它' : '物品已上架',
    )
    return true
  }

  // ---------- 借阅 / 归还 ----------
  function borrow(id: number): boolean {
    const it = itemById(id)
    if (!it) return false
    if (!auth.phone) {
      toast.error('请先登录', '借用前请先用手机号登录')
      return false
    }
    if (!canBorrow(it, auth.phone)) {
      if (it.ownerPhone === auth.phone) {
        toast.warning('这是你自己的物品', '不能借用自己发布的物品')
      } else if (it.status !== 'available' || it.archived) {
        toast.warning('暂时借不了', '该物品当前不可借用')
      } else {
        toast.warning('暂时借不了', '该物品当前不可借用')
      }
      return false
    }
    Object.assign(it, borrowOp(it, auth.phone))
    persist()
    toast.success('借用成功', '请联系物主取物，用完记得归还')
    return true
  }

  function returnBack(id: number): boolean {
    const it = itemById(id)
    if (!it) return false
    if (!canReturn(it, auth.phone)) {
      toast.error('无法归还', '只有借阅人本人可以操作归还')
      return false
    }
    Object.assign(it, returnOp(it))
    persist()
    toast.success('归还成功', '物品已恢复为可借状态')
    return true
  }

  // ---------- 上下架（仅物主） ----------
  function setArchived(id: number, archived: boolean): boolean {
    const it = itemById(id)
    if (!it) return false
    if (!isOwner(it, auth.phone)) {
      toast.error('无权操作', '只有发布者可以管理自己的物品')
      return false
    }
    it.archived = archived
    persist()
    toast.success(archived ? '已下架' : '已上架', archived ? '物品已从列表隐藏' : '物品重新对邻居可见')
    return true
  }

  // ---------- 筛选 ----------
  function setCategory(id: CategoryId | 'all'): void {
    category.value = id
  }

  function setSearch(q: string): void {
    search.value = q
  }

  function setRadius(r: number | 'all'): void {
    radiusKm.value = r
  }

  return {
    items,
    search,
    category,
    radiusKm,
    showLent,
    onlyMine,
    userPosition,
    locating,
    load,
    locate,
    distanceOf,
    distanceLabel,
    visibleItems,
    itemById,
    publish,
    borrow,
    returnBack,
    setArchived,
    setCategory,
    setSearch,
    setRadius,
  }
})
