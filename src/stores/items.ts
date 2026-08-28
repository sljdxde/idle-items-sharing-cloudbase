// ================================================
// src/stores/items.ts — 物品与筛选的全局状态（Pinia）
// 数据源：GitHub Issues 共享数据层（items.json 快照 → 实时 API → 种子兜底）
// 写操作：发布=预填 issues/new；借/还/上下架=评论命令（Actions 自动处理）
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CategoryId, Item } from '@/lib/types'
import { listItems, buildPublishUrl, issueUrl, borrowCommand, RETURN_COMMAND, ARCHIVE_COMMAND, UNARCHIVE_COMMAND } from '@/lib/github'
import { matchesCategory, matchesRadius, matchesSearch } from '@/lib/filters'
import { canBorrow, canReturn, isOwner } from '@/lib/itemOps'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { copyText } from '@/lib/clipboard'
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

/** 打开 Issue 评论区并尝试复制命令文本 */
async function openIssueWithCommand(id: number, cmd: string, tip: string): Promise<void> {
  await copyText(cmd)
  window.open(issueUrl(id), '_blank', 'noopener')
  window.alert(`已复制「${cmd}」到剪贴板\n\n${tip}`)
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

  // ---------- 加载（GitHub Issues 共享数据） ----------
  async function load(): Promise<void> {
    loading.value = true
    try {
      items.value = await listItems()
    } catch {
      if (items.value.length === 0) items.value = []
    } finally {
      loading.value = false
      userPosition.value = readStoredPos()
    }
  }

  load()

  async function refresh(): Promise<void> {
    await load()
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

  // ---------- 发布（打开预填 GitHub Issue 创建页） ----------
  function publish(draft: {
    name: string
    desc: string
    contactType: 'phone' | 'building'
    contact: string
    imgUrl: string
    category: CategoryId
    position: LatLng | null
  }): boolean {
    if (!auth.phone) {
      toast.error('请先登录', '发布闲置需要先登录')
      return false
    }
    const url = buildPublishUrl({
      name: draft.name,
      desc: draft.desc,
      contactType: draft.contactType,
      contact: draft.contact,
      imgUrl: draft.imgUrl,
      category: draft.category,
      ownerPhone: auth.phone,
      lat: draft.position?.lat ?? null,
      lng: draft.position?.lng ?? null,
    })
    const w = window.open(url, '_blank', 'noopener')
    if (!w) {
      toast.warning('弹窗被拦截', '请允许本站点弹出窗口后重试')
    } else {
      toast.info('正在打开发布页', '在 GitHub 上提交后，物品即对所有邻居可见')
    }
    return true
  }

  // ---------- 借阅 / 归还 / 上下架（评论命令引导） ----------
  function borrow(id: number): boolean {
    const it = itemById(id)
    if (!it) return false
    if (!auth.phone) {
      toast.error('请先登录', '借用前请先用手机号登录')
      return false
    }
    if (!canBorrow(it, auth.phone)) {
      toast.warning('暂时借不了', '该物品当前不可借用')
      return false
    }
    void openIssueWithCommand(
      id,
      borrowCommand(auth.phone),
      `在评论区粘贴并发送，物品即标记为「已借出」。`,
    )
    return true
  }

  function returnBack(id: number): boolean {
    const it = itemById(id)
    if (!it) return false
    if (!canReturn(it, auth.phone)) {
      toast.error('无法归还', '只有借阅人本人可以操作归还')
      return false
    }
    void openIssueWithCommand(id, RETURN_COMMAND, '在评论区粘贴并发送「归还」，物品恢复可借。')
    return true
  }

  function setArchived(id: number, archived: boolean): boolean {
    const it = itemById(id)
    if (!it) return false
    if (!isOwner(it, auth.phone)) {
      toast.error('无权操作', '只有发布者可以管理自己的物品')
      return false
    }
    void openIssueWithCommand(
      id,
      archived ? ARCHIVE_COMMAND : UNARCHIVE_COMMAND,
      archived
        ? '在评论区粘贴并发送「下架」，物品将从公开列表隐藏。'
        : '在评论区粘贴并发送「上架」，物品重新可见。',
    )
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
