<script setup lang="ts">
// ================================================
// HomePage — Hero 拼贴 + 工具栏（搜索/分类/距离/状态）+ 卡片网格
// 数据为本地持久层（同步加载）；挂载时静默尝试定位以启用距离排序
// ================================================

import { onMounted, ref, type ComponentPublicInstance } from 'vue'
import { RouterLink } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { usePagedList } from '@/composables/usePagedList'
import { useToast } from '@/composables/useToast'
import type { Item } from '@/lib/types'
import FilterToolbar from '@/components/FilterToolbar.vue'
import MyPanel from '@/components/MyPanel.vue'
import ItemCard from '@/components/ItemCard.vue'
import BorrowModal from '@/components/BorrowModal.vue'
import ManageModal from '@/components/ManageModal.vue'

const store = useItemsStore()
const toast = useToast()

const borrowItem = ref<Item | null>(null)
const manageItem = ref<Item | null>(null)

// 全量数据留在 store 里（搜索、距离排序都要它），首页只逐页渲染卡片
const {
  visible: pagedItems,
  hasMore,
  pageSize,
  sentinel: loadSentinel,
  loadMore,
} = usePagedList(() => store.visibleItems, {
  resetOn: () =>
    `${store.search}|${store.category}|${store.radiusKm}|${store.showLent ? 1 : 0}`,
})

/** 哨兵元素交给 composable 观察（函数式 ref，字符串 ref 不被模板类型检查计为使用） */
function bindLoadSentinel(el: Element | ComponentPublicInstance | null): void {
  loadSentinel.value = (el as HTMLElement | null) ?? null
}

onMounted(() => {
  store.load()
  // 静默定位：成功则按距离排序，失败不打扰（工具栏有手动入口）
  store.locate()
})

function onRefresh(): void {
  store.refresh()
  toast.success('已刷新', '已从云端重新载入社区好物')
}
</script>

<template>
  <main class="memphis-container home-main">
    <!-- 我的发布 / 我的借用（登录后显示，置于首屏靠上、与搜索框分离） -->
    <MyPanel />

    <!-- Hero：拼贴卡 -->
    <section class="memphis-hero">
      <div class="hero-collage-card">
        <span class="hero-tape t1" aria-hidden="true"></span>
        <span class="hero-tape t2" aria-hidden="true"></span>
        <div class="hero-badge-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          社区闲置 · 邻里互助 · 就在附近
        </div>
        <h1 class="hero-headline">让好物在<span class="retro-tag">邻里间流转</span></h1>
        <p class="hero-subhead">发现附近的闲置好物，按距离找到身边的邻居；借用、归还，让每一件物品继续发挥价值。</p>
        <div class="hero-button-group">
          <RouterLink to="/publish" class="btn-memphis-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            发布我的闲置
          </RouterLink>
          <a href="#item-grid" class="btn-memphis-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            浏览好物
          </a>
        </div>
      </div>

      <!-- 几何漂浮装饰 -->
      <span class="deco-circle" aria-hidden="true"></span>
      <span class="deco-triangle" aria-hidden="true"></span>
    </section>

    <!-- 工具栏：搜索 / 分类 / 距离 / 状态 / 刷新 -->
    <FilterToolbar @refresh="onRefresh" />

    <!-- 加载态（云端数据） -->
    <div v-if="store.loading && store.visibleItems.length === 0" class="loading-box">
      <span class="loading-dot" aria-hidden="true"></span>
      正在从云端加载社区好物…
    </div>

    <!-- 空状态 -->
    <div v-if="store.visibleItems.length === 0" class="empty-box">
      <div class="empty-geom" aria-hidden="true">
        <span class="e-sq"></span><span class="e-ci"></span><span class="e-tr"></span>
      </div>
      <template v-if="store.search || store.category !== 'all' || store.showLent">
        <h2 class="empty-title">没找到匹配的好物</h2>
        <p class="empty-desc">换个关键词，或清除筛选条件试试。</p>
        <button type="button" class="btn-memphis-secondary"
          @click="store.search = ''; store.setCategory('all'); store.showLent = false">
          清除筛选
        </button>
      </template>
      <template v-else-if="store.radiusKm !== 'all'">
        <h2 class="empty-title">附近暂无闲置物品</h2>
        <p class="empty-desc">{{ store.userPosition ? '试着扩大距离范围，或改选「全部距离」看看。' : '尚未获取定位，点击「获取定位」或改选「全部距离」看看。' }}</p>
        <button type="button" class="btn-memphis-secondary" @click="store.setRadius('all')">
          查看全部距离
        </button>
      </template>
      <template v-else>
        <h2 class="empty-title">暂无闲置物品</h2>
        <p class="empty-desc">成为第一个分享好物的人吧。</p>
        <RouterLink to="/publish" class="btn-memphis-primary">发布第一件</RouterLink>
      </template>
    </div>

    <!-- 网格：逐页渲染，滚到底自动补下一页 -->
    <section v-else id="item-grid" class="memphis-grid" aria-label="闲置物品列表">
      <TransitionGroup name="grid">
        <div v-for="(item, i) in pagedItems" :key="item.id" class="grid-cell">
          <ItemCard :item="item" :index="i" @borrow="borrowItem = $event" @manage="manageItem = $event" />
        </div>
      </TransitionGroup>

      <div :ref="bindLoadSentinel" class="grid-sentinel" aria-hidden="true"></div>
      <div v-if="hasMore" class="grid-more">
        <button type="button" class="btn-memphis-secondary" @click="loadMore">
          加载更多 · {{ pagedItems.length }}/{{ store.visibleItems.length }}
        </button>
      </div>
      <p v-else-if="store.visibleItems.length > pageSize" class="grid-end">
        已显示全部 {{ store.visibleItems.length }} 件
      </p>
    </section>

    <!-- 共享说明：数据在云端，全员可见 -->
    <section class="data-manage-box" aria-label="共享说明">
      <div class="data-manage-head">
        <span class="data-manage-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
            <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path>
            <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"></path>
          </svg>
        </span>
        <div>
          <h2 class="data-manage-title">社区共享</h2>
          <p class="data-manage-desc">物品数据由全体邻居共享。发布 / 借用 / 归还 / 上下架均在本站完成，操作后全站即时可见。</p>
        </div>
      </div>
    </section>

    <BorrowModal :open="borrowItem !== null" :item="borrowItem" @close="borrowItem = null" />
    <ManageModal :open="manageItem !== null" :item="manageItem" @close="manageItem = null" />
  </main>
</template>

<style scoped>
.home-main {
  padding-top: 0.5rem;
}

/* ── Hero ── */
.memphis-hero {
  position: relative;
  margin-bottom: 2rem;
}

.hero-collage-card {
  position: relative;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 8px 8px 0 var(--mustard);
  padding: clamp(1.6rem, 4vw, 3rem);
  transform: rotate(-0.6deg);
}

.hero-tape {
  position: absolute;
  width: 92px;
  height: 22px;
  background: rgba(244, 162, 97, 0.75);
  border: 1px solid var(--ink);
  z-index: 5;
}

.hero-tape.t1 {
  top: -12px;
  left: 8%;
  transform: rotate(-4deg);
}

.hero-tape.t2 {
  bottom: -10px;
  right: 10%;
  transform: rotate(3deg);
}

.hero-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  border: 2px solid var(--ink);
  background: var(--bg-cream);
  box-shadow: 2px 2px 0 var(--ink);
  padding: 0.3rem 0.7rem;
  margin-bottom: 1.1rem;
}

.hero-headline {
  font-family: var(--font-serif);
  font-size: clamp(2.1rem, 5.5vw, 3.6rem);
  line-height: 1.15;
  text-wrap: balance;
  margin-bottom: 0.9rem;
}

.retro-tag {
  display: inline-block;
  background: var(--mustard);
  border: 2.5px solid var(--ink);
  box-shadow: 4px 4px 0 var(--retro-red);
  padding: 0 0.35em;
  transform: rotate(-1.5deg) scale(1.03);
}

.hero-subhead {
  max-width: 36em;
  color: #444;
  margin-bottom: 1.5rem;
}

.hero-button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

/* 漂浮几何 */
.deco-circle {
  position: absolute;
  top: -16px;
  right: 4%;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--royal-blue);
  border: 3px solid var(--ink);
  box-shadow: 4px 4px 0 var(--ink);
  transform: rotate(6deg);
  z-index: 6;
}

.deco-triangle {
  position: absolute;
  bottom: -14px;
  left: 38%;
  width: 0;
  height: 0;
  border-left: 22px solid transparent;
  border-right: 22px solid transparent;
  border-bottom: 38px solid var(--salmon);
  filter: drop-shadow(3px 3px 0 rgba(29, 30, 44, 0.9));
  z-index: 6;
}

@media (max-width: 640px) {

  .deco-circle,
  .deco-triangle {
    display: none;
  }

  .hero-button-group {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-button-group .btn-memphis-primary,
  .hero-button-group .btn-memphis-secondary {
    width: 100%;
  }
}

/* ── 网格 ── */
.memphis-grid {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.6rem 1.25rem;
}

@media (min-width: 640px) {
  .memphis-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 960px) {
  .memphis-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.grid-cell {
  display: flex;
}

.grid-cell > * {
  width: 100%;
}

/* 网格容器里尾部元素必须横跨整行，否则会掉进某一列 */
.grid-sentinel,
.grid-more,
.grid-end {
  grid-column: 1 / -1;
}

.grid-sentinel {
  height: 1px;
}

.grid-more {
  display: flex;
  justify-content: center;
}

.grid-end {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: #555;
  text-align: center;
}

/* ── 空状态 ── */
.empty-box {
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 6px 6px 0 var(--royal-blue);
  padding: 3rem 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  transform: rotate(-0.4deg);
}

.empty-geom {
  display: flex;
  gap: 0.8rem;
}

.empty-geom span {
  display: inline-block;
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.e-sq {
  width: 26px;
  height: 26px;
  background: var(--retro-red);
  transform: rotate(-8deg);
}

.e-ci {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--royal-blue);
}

.e-tr {
  width: 0;
  height: 0;
  border-left: 16px solid transparent;
  border-right: 16px solid transparent;
  border-bottom: 28px solid var(--mustard);
  filter: drop-shadow(2px 2px 0 var(--ink));
}

.empty-title {
  font-family: var(--font-serif);
  font-size: 1.5rem;
}

.empty-desc {
  color: #555;
}

/* ── 加载态 ── */
.loading-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.9rem;
  color: #555;
  background: var(--paper-cream);
  border: 2.5px solid var(--ink);
  box-shadow: 4px 4px 0 var(--royal-blue);
  padding: 1.2rem 1.4rem;
  margin-bottom: 2rem;
}

.loading-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--retro-red);
  border: 2px solid var(--ink);
  animation: loadingPulse 0.9s ease-in-out infinite;
}

@keyframes loadingPulse {

  0%,
  100% {
    transform: scale(0.7);
    opacity: 0.6;
  }

  50% {
    transform: scale(1);
    opacity: 1;
  }
}

/* ── 数据管理卡 ── */
.data-manage-box {
  margin-top: 2.5rem;
  background: var(--bg-cream);
  border: 2.5px dashed var(--ink);
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.data-manage-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.data-manage-icon {
  display: inline-flex;
  width: 40px;
  height: 40px;
  flex: none;
  align-items: center;
  justify-content: center;
  background: var(--mustard);
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
}

.data-manage-title {
  font-family: var(--font-serif);
  font-size: 1.1rem;
}

.data-manage-desc {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: #777;
}
</style>
