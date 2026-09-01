// ================================================
// src/stores/items.ts — 物品与筛选的全局状态（Pinia）
// 读：items.json 同源快照 → 代理实时 → 种子兜底（lib/github.ts）
// 写：发布/借用/归还/上下架 → 云端代理（lib/api.ts），用户全程无感 GitHub
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CategoryId, Item } from '@/lib/types'
import { listItems } from '@/lib/github'
import { isSeedFallback } from '@/lib/seed'
import { api } from '@/lib/api'
import { matchesCategory, matchesRadius, matchesSearch } from '@/lib/filters'
import { borrowItem, canArchive, canBorrow, canDelete, canReturn, isOwner, returnItem } from '@/lib/itemOps'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import {
  DEFAULT_RADIUS_KM,
  distanceKm,
  formatDistance,
  getBrowserLocation,
  itemLatLng,
  type LatLng,
  type LocateFailReason,
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
  /** 当前用户定位 */
  const userPosition = ref<LatLng | null>(null)
  const locating = ref(false)
  const loading = ref(false)
  /** 任一写操作进行中（发布/借用/归还/上下架/删除），用于按钮防重复点击 */
  const writing = ref(false)

  // ---------- 写后待对账 ----------
  /**
   * 服务端（GitHub Issues）写入有秒级读延迟，而全量列表读取要数秒。
   * 写成功后先把结果乐观落到本地并立即放行交互，后台再确认服务端已追上；
   * 对账期间的滞后读取不得覆盖这些乐观结果。value 为 null 表示该物品应已消失（删除）。
   */
  const pendingWrites = new Map<number, { value: Item | null; settled: (it: Item) => boolean }>()

  /** 用未对账的乐观结果修正服务端列表：滞后则覆盖，已删除则隐藏，新发布则补上 */
  function mergePending(list: Item[]): Item[] {
    if (pendingWrites.size === 0) return list
    const out = list.flatMap((it) => {
      const pw = pendingWrites.get(it.id)
      if (!pw) return [it]
      if (pw.settled(it)) {
        pendingWrites.delete(it.id)
        return [it]
      }
      return pw.value ? [pw.value] : []
    })
    const serverIds = new Set(list.map((it) => it.id))
    for (const [id, pw] of [...pendingWrites]) {
      if (serverIds.has(id)) continue
      if (pw.value === null) pendingWrites.delete(id)
      else out.unshift(pw.value)
    }
    return out
  }

  /** 乐观落地：本地立即反映写入结果 */
  function applyWrite(id: number, value: Item | null, settled: (it: Item) => boolean): void {
    pendingWrites.set(id, { value, settled })
    const cur = items.value
    if (value === null) items.value = cur.filter((it) => it.id !== id)
    else if (cur.some((it) => it.id === id))
      items.value = cur.map((it) => (it.id === id ? value : it))
    else items.value = [value, ...cur]
  }

  // ---------- 加载（共享数据） ----------
  /** 首屏快照校准只做一次 */
  let calibrated = false

  async function load(force = false): Promise<void> {
    // 内存已有数据时不回读快照：items.json 只在 CI/部署时生成，
    // 用它覆盖会把写后的新状态（如刚借出）改回旧值。
    if (!force && items.value.length > 0) return
    loading.value = true
    try {
      const next = await listItems(force)
      // 实时与快照都读不到时 listItems 会返回演示种子：
      // 已有真实数据就不许它把整站列表换成示例物品。
      if (!isSeedFallback(next) || items.value.length === 0) items.value = mergePending(next)
    } catch {
      if (items.value.length === 0) items.value = []
    } finally {
      loading.value = false
      userPosition.value = readStoredPos()
    }
    // 快照可能落后几分钟（别人刚借走的还显示「可借」）：渲染完用实时列表静默校准
    if (!force && !calibrated) {
      calibrated = true
      void load(true)
    }
  }

  load()

  /** 显式刷新（工具栏「刷新」按钮） */
  async function refresh(): Promise<void> {
    await load(true)
  }

  /** 后台对账：确认服务端已反映待处理的写入；不阻塞交互 */
  async function reconcile(): Promise<void> {
    for (let i = 0; i < 3 && pendingWrites.size > 0; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500))
      await load(true)
    }
  }

  /** 重新获取定位（发布页/工具栏的「定位」按钮）；成功 'ok'，失败返回具体原因 */
  async function locate(): Promise<'ok' | LocateFailReason> {
    locating.value = true
    const { pos, reason } = await getBrowserLocation()
    locating.value = false
    if (pos) {
      userPosition.value = pos
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos))
      } catch {
        /* ignore */
      }
      return 'ok'
    }
    return reason ?? 'timeout'
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

  // ---------- 派生：首页可见列表 ----------
  const visibleItems = computed(() =>
    items.value
      .filter((it) => !it.archived)
      .filter((it) => matchesCategory(it, category.value))
      .filter((it) => matchesSearch(it, search.value))
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

  /** 「我的发布」页：登录手机号与发布者一致的物品（含已下架），最新在前 */
  const myItems = computed(() =>
    items.value
      .filter((it) => isOwner(it, auth.phone))
      .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()),
  )

  /** 「我的借用」页：登录手机号与借阅人一致的物品，最新在前 */
  const borrowedItems = computed(() =>
    items.value
      .filter((it) => canReturn(it, auth.phone))
      .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()),
  )

  function owns(item: Item): boolean {
    return isOwner(item, auth.phone)
  }

  function holds(item: Item): boolean {
    return canReturn(item, auth.phone)
  }

  function borrowable(item: Item): boolean {
    return canBorrow(item, auth.phone)
  }

  function itemById(id: number): Item | undefined {
    return items.value.find((it) => it.id === id)
  }

  /** 首屏列表还在读取时点按钮：给反馈，不静默吞掉这次点击 */
  function requireItem(id: number): Item | undefined {
    const it = itemById(id)
    if (!it) toast.warning('稍等一下', '好物列表还在加载，请过会儿再点一次')
    return it
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
      const { id } = await api.publish({
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
      // 乐观补上：新物品立即可见，服务端读延迟交给后台对账收敛
      applyWrite(
        id,
        {
          id,
          name: draft.name.trim(),
          desc: draft.desc.trim(),
          contactType: draft.contactType,
          contact: draft.contact.trim(),
          imgUrl: draft.imgUrl,
          status: 'available',
          ownerPhone: phone,
          lat: draft.position?.lat ?? null,
          lng: draft.position?.lng ?? null,
          category: draft.category,
          createTime: new Date().toISOString(),
          archived: false,
        },
        () => true,
      )
      toast.success('发布成功', '邻居已经可以看到这件闲置了')
      void reconcile()
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
    const it = requireItem(id)
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
      applyWrite(id, borrowItem(it, phone), (s) => s.status === 'lent' && s.borrowedBy === phone)
      toast.success('借用成功', '用完记得归还，让好物继续流转')
      void reconcile()
      return true
    } catch (e) {
      toast.error('借用失败', errMsg(e))
      return false
    } finally {
      writing.value = false
    }
  }

  async function returnBack(id: number): Promise<boolean> {
    const it = requireItem(id)
    if (!it) return false
    if (!canReturn(it, auth.phone)) {
      toast.error('无法归还', '只有借阅人可以归还这件物品')
      return false
    }
    if (writing.value) return false
    writing.value = true
    try {
      await api.returnBack(id, auth.phone!)
      applyWrite(id, returnItem(it), (s) => s.status === 'available')
      toast.success('归还成功', '物品已恢复「可借」，感谢分享')
      void reconcile()
      return true
    } catch (e) {
      toast.error('归还失败', errMsg(e))
      return false
    } finally {
      writing.value = false
    }
  }

  async function setArchived(id: number, archived: boolean): Promise<boolean> {
    const it = requireItem(id)
    if (!it) return false
    if (!canArchive(it, auth.phone)) {
      toast.error('无权操作', '只有发布者可以上下架这件物品')
      return false
    }
    if (writing.value) return false
    writing.value = true
    try {
      if (archived) await api.archive(id, auth.phone!)
      else await api.unarchive(id, auth.phone!)
      applyWrite(id, { ...it, archived }, (s) => !!s.archived === archived)
      toast.success(archived ? '已下架' : '已上架', archived ? '物品已从公开列表隐藏' : '物品已重新对邻居可见')
      void reconcile()
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

  /** 删除物品（仅物主；从社区列表彻底移除，不可恢复） */
  async function remove(id: number): Promise<boolean> {
    const it = requireItem(id)
    if (!it) return false
    if (!canDelete(it, auth.phone)) {
      const mine = isOwner(it, auth.phone)
      toast.error(
        !mine ? '无权操作' : '无法删除',
        !mine
          ? '只有发布者可以删除这件物品'
          : '物品借出中，请先收回（或等邻居归还）再删除',
      )
      return false
    }
    if (writing.value) return false
    writing.value = true
    try {
      await api.remove(id, auth.phone!)
      applyWrite(id, null, () => false)
      toast.success('已删除', '物品已从社区列表彻底移除')
      void reconcile()
      return true
    } catch (e) {
      toast.error('删除失败', errMsg(e))
      return false
    } finally {
      writing.value = false
    }
  }

  return {
    items,
    search,
    category,
    radiusKm,
    showLent,
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
    myItems,
    borrowedItems,
    itemById,
    owns,
    holds,
    borrowable,
    publish,
    borrow,
    returnBack,
    setArchived,
    remove,
    setCategory,
    setSearch,
    setRadius,
  }
})
