// ================================================
// src/stores/items.ts — 物品与筛选的全局状态（Pinia）
// 读：items.json 同源快照 → 代理实时 → 种子兜底（lib/github.ts）
// 写：发布/借用/归还/上下架 → 云端代理（lib/api.ts），用户全程无感 GitHub
// ================================================

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { CategoryId, Item } from '@/lib/types'
import { listItems } from '@/lib/github'
import { api } from '@/lib/api'
import { matchesCategory, matchesRadius, matchesSearch } from '@/lib/filters'
import { canBorrow, canReturn, isOwner } from '@/lib/itemOps'
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

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : '请稍后再试'
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
  /** 我的发布 / 我的借用：互斥（点击其一自动取消另一个） */
  const onlyMine = ref(false)
  const onlyBorrowed = ref(false)
  /** 当前用户定位 */
  const userPosition = ref<LatLng | null>(null)
  const locating = ref(false)
  const loading = ref(false)
  /** 任一写操作进行中（发布/借用/归还/上下架），用于按钮防重复点击 */
  const writing = ref(false)

  // 登出后重置「我的」筛选，避免残留状态影响下次登录
  watch(
    () => auth.phone,
    (phone) => {
      if (!phone) {
        onlyMine.value = false
        onlyBorrowed.value = false
      }
    },
  )

  // ---------- 加载（共享数据） ----------
  async function load(force = false): Promise<void> {
    loading.value = true
    try {
      items.value = await listItems(force)
    } catch {
      if (items.value.length === 0) items.value = []
    } finally {
      loading.value = false
      userPosition.value = readStoredPos()
    }
  }

  load()

  /** 刷新：代理实时优先（写操作后立即见新状态），失败回快照 */
  async function refresh(): Promise<void> {
    await load(true)
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

  /** 卡片/详情页用的距离文案：无定位且用户已定位 → 「距离未知」 */
  function distanceLabel(item: Item): string | null {
    const p = itemLatLng(item)
    if (!p) return userPosition.value ? '距离未知' : null
    const d = distanceOf(item)
    return d === null ? null : formatDistance(d)
  }

  // ---------- 派生：可见列表 ----------
  const visibleItems = computed(() =>
    items.value
      // ① 角色视图优先：「我的发布」看自己全部（含已下架）；「我的借用」看借给我的（即便已下架）
      .filter((it) => {
        if (onlyMine.value && !!auth.phone && it.ownerPhone === auth.phone) return true
        if (onlyBorrowed.value && !!auth.phone && it.borrowedBy === auth.phone) return true
        return !it.archived
      })
      .filter((it) =>
        onlyMine.value && auth.phone ? it.ownerPhone === auth.phone : true,
      )
      .filter((it) =>
        onlyBorrowed.value && auth.phone ? it.borrowedBy === auth.phone : true,
      )
      .filter((it) => matchesCategory(it, category.value))
      .filter((it) => matchesSearch(it, search.value))
      // ② 默认隐藏已借出；但「我的发布/我的借用」里自己的物品始终显示
      .filter((it) => {
        if (showLent.value) return true
        if (onlyMine.value && auth.phone && it.ownerPhone === auth.phone) return true
        if (onlyBorrowed.value && auth.phone && it.borrowedBy === auth.phone) return true
        return it.status === 'available'
      })
      .filter((it) => matchesRadius(it, userPosition.value, radiusKm.value))
      // ③ 用户已定位时按距离升序（无定位物品排最后），否则最新优先
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

  // ---------- 发布（云端代理，站内完成） ----------
  async function publish(draft: {
    name: string
    desc: string
    contactType: 'phone' | 'building'
    contact: string
    imgUrl: string
    category: CategoryId
    position: LatLng | null
  }): Promise<boolean> {
    if (!auth.phone) {
      toast.error('请先登录', '发布闲置需要先登录')
      return false
    }
    if (writing.value) return false
    writing.value = true
    const phone = auth.phone
    try {
      await api.publish({
        name: draft.name,
        desc: draft.desc,
        contactType: draft.contactType,
        contact: draft.contact,
        imgUrl: draft.imgUrl,
        category: draft.category,
        ownerPhone: phone,
        lat: draft.position?.lat ?? null,
        lng: draft.position?.lng ?? null,
      })
      toast.success('发布成功', '你的好物已对所有邻居可见')
      await refresh()
      return true
    } catch (e) {
      toast.error('发布失败', errMsg(e))
      return false
    } finally {
      writing.value = false
    }
  }

  // ---------- 借用 / 归还 / 上下架（云端代理，站内完成） ----------
  async function borrow(id: number): Promise<boolean> {
    const it = itemById(id)
    if (!it) return false
    if (!auth.phone) {
      toast.error('请先登录', '借用前请先用手机号登录')
      return false
    }
    const phone = auth.phone
    if (!canBorrow(it, phone)) {
      toast.warning('暂时借不了', '该物品当前不可借用')
      return false
    }
    if (writing.value) return false
    writing.value = true
    try {
      await api.borrow(id, phone)
      toast.success('借用成功', '物品已标记为「已借出」，请按联系方式与物主交接')
      await refresh()
      return true
    } catch (e) {
      toast.error('借用失败', errMsg(e))
      return false
    } finally {
      writing.value = false
    }
  }

  async function returnBack(id: number): Promise<boolean> {
    const it = itemById(id)
    if (!it) return false
    const phone = auth.phone
    if (!phone || !canReturn(it, phone)) {
      toast.error('无法归还', '只有借阅人本人可以操作归还')
      return false
    }
    if (writing.value) return false
    writing.value = true
    try {
      await api.returnBack(id, phone)
      toast.success('归还成功', '物品已恢复「可借」，感谢分享')
      await refresh()
      return true
    } catch (e) {
      toast.error('归还失败', errMsg(e))
      return false
    } finally {
      writing.value = false
    }
  }

  async function setArchived(id: number, archived: boolean): Promise<boolean> {
    const it = itemById(id)
    if (!it) return false
    const phone = auth.phone
    if (!phone || !isOwner(it, phone)) {
      toast.error('无权操作', '只有发布者可以管理自己的物品')
      return false
    }
    if (writing.value) return false
    writing.value = true
    try {
      if (archived) await api.archive(id, phone)
      else await api.unarchive(id, phone)
      toast.success(archived ? '已下架' : '已上架', archived ? '物品已从公开列表隐藏' : '物品已重新对邻居可见')
      await refresh()
      return true
    } catch (e) {
      toast.error(archived ? '下架失败' : '上架失败', errMsg(e))
      return false
    } finally {
      writing.value = false
    }
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

  /** 切换「我的发布」；开启时自动取消「我的借用」 */
  function toggleMine(): void {
    onlyMine.value = !onlyMine.value
    if (onlyMine.value) onlyBorrowed.value = false
  }

  /** 切换「我的借用」；开启时自动取消「我的发布」 */
  function toggleBorrowed(): void {
    onlyBorrowed.value = !onlyBorrowed.value
    if (onlyBorrowed.value) onlyMine.value = false
  }

  return {
    items,
    search,
    category,
    radiusKm,
    showLent,
    onlyMine,
    onlyBorrowed,
    userPosition,
    locating,
    loading,
    writing,
    load,
    refresh,
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
    toggleMine,
    toggleBorrowed,
  }
})
