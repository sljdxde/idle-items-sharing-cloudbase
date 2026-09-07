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
  <main class="container home-main">
    <!-- 我的发布 / 我的借用（登录后显示，置于首屏靠上、与搜索框分离） -->
    <MyPanel />

    <!-- Hero -->
    <section class="hero">
      <div class="hero-box">
        <span class="hero-tape t1" aria-hidden="true"></span>
        <span class="hero-tape t2" aria-hidden="true"></span>
        <div class="hero-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          社区闲置 · 邻里互助 · 就在附近
        </div>
        <h1 class="hero-title">让好物在<em>邻里间流转</em></h1>
        <p class="hero-sub">发现附近的闲置好物，按距离找到身边的邻居；借用、归还，让每一件物品继续发挥价值。</p>
        <div class="hero-actions">
          <RouterLink to="/publish" class="btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            发布我的闲置
          </RouterLink>
          <a href="#item-grid" class="btn-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            浏览好物
          </a>
        </div>
      </div>

      <!-- 几何漂浮装饰（memphis 主题） -->
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
        <button type="button" class="btn-secondary"
          @click="store.search = ''; store.setCategory('all'); store.showLent = false">
          清除筛选
        </button>
      </template>
      <template v-else-if="store.radiusKm !== 'all'">
        <h2 class="empty-title">附近暂无闲置物品</h2>
        <p class="empty-desc">{{ store.userPosition ? '试着扩大距离范围，或改选「全部距离」看看。' : '尚未获取定位，点击「获取定位」或改选「全部距离」看看。' }}</p>
        <button type="button" class="btn-secondary" @click="store.setRadius('all')">
          查看全部距离
        </button>
      </template>
      <template v-else>
        <h2 class="empty-title">暂无闲置物品</h2>
        <p class="empty-desc">成为第一个分享好物的人吧。</p>
        <RouterLink to="/publish" class="btn-primary">发布第一件</RouterLink>
      </template>
    </div>

    <!-- 网格：逐页渲染，滚到底自动补下一页 -->
    <section v-else id="item-grid" class="card-grid" aria-label="闲置物品列表">
      <!-- brutalism 主题桌面端表格表头（CSS 控制显示） -->
      <div class="table-head">
        <span>图片</span>
        <span>物品</span>
        <span>租金</span>
        <span>状态</span>
        <span>距离</span>
        <span>发布时间</span>
        <span>操作</span>
      </div>

      <TransitionGroup name="grid">
        <div v-for="(item, i) in pagedItems" :key="item.id" class="grid-cell">
          <ItemCard :item="item" :index="i" @borrow="borrowItem = $event" @manage="manageItem = $event" />
        </div>
      </TransitionGroup>

      <div :ref="bindLoadSentinel" class="grid-sentinel" aria-hidden="true"></div>
      <div v-if="hasMore" class="grid-more">
        <button type="button" class="btn-secondary" @click="loadMore">
          加载更多 · {{ pagedItems.length }}/{{ store.visibleItems.length }}
        </button>
      </div>
      <p v-else-if="store.visibleItems.length > pageSize" class="grid-end">
        已显示全部 {{ store.visibleItems.length }} 件
      </p>
    </section>

    <!-- 共享说明：数据在云端，全员可见 -->
    <section class="data-manage-box" aria-label="共享说明">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path>
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"></path>
      </svg>
      <div>
        <h2 class="data-manage-title">社区共享</h2>
        <p class="data-manage-desc">物品数据由全体邻居共享。发布 / 借用 / 归还 / 上下架均在本站完成，操作后全站即时可见。</p>
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

/* ── Hero（基础样式，三主题共用变量） ── */
.hero {
  margin-bottom: 2.5rem;
  position: relative;
}

.hero-box {
  max-width: 46rem;
  position: relative;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 1.25rem;
}

.hero-badge svg {
  width: 14px;
  height: 14px;
}

.hero-title {
  font-family: var(--font-head);
  font-size: clamp(2rem, 5.5vw, 3.4rem);
  font-weight: 900;
  line-height: 1.15;
  color: var(--ink);
  text-wrap: balance;
  margin-bottom: 1.15rem;
  max-width: 18ch;
}

.hero-title em {
  font-style: normal;
}

.hero-sub {
  max-width: 34em;
  color: var(--text-2);
  margin-bottom: 1.75rem;
  font-size: 0.98rem;
  line-height: 1.75;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

/* Hero 胶带装饰（默认隐藏，memphis 主题显示） */
.hero-tape {
  display: none;
  position: absolute;
  width: 92px;
  height: 20px;
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

/* 几何漂浮装饰（默认隐藏，memphis 主题显示） */
.deco-circle,
.deco-triangle {
  display: none;
  position: absolute;
  z-index: 6;
}

/* ── 物品卡片网格 ── */
.card-grid {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.85rem 1.4rem;
}

@media (min-width: 640px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 960px) {
  .card-grid {
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
  margin: 0.5rem 0 0;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--text-3);
  text-align: center;
}

/* brutalism 表格表头：默认隐藏 */
.table-head {
  display: none;
}

/* ── 空状态 ── */
.empty-box {
  background: var(--surface);
  border: var(--border);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius);
  padding: 3rem 1.5rem;
  margin-bottom: 1rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
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
  background: var(--accent-2);
  transform: rotate(-8deg);
}

.e-ci {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent-4);
}

.e-tr {
  width: 0;
  height: 0;
  border-left: 16px solid transparent;
  border-right: 16px solid transparent;
  border-bottom: 28px solid var(--accent-3);
  filter: drop-shadow(2px 2px 0 var(--ink));
}

.empty-title {
  font-family: var(--font-head);
  font-size: 1.35rem;
  color: var(--ink);
}

.empty-desc {
  color: var(--text-2);
  font-size: 0.92rem;
}

/* ── 加载态 ── */
.loading-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-2);
  background: var(--surface);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
  padding: 1.1rem 1.3rem;
  margin-bottom: 2rem;
}

.loading-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
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

/* ── 共享说明 ── */
.data-manage-box {
  margin-top: 2.5rem;
  background: var(--surface);
  border: var(--border-dashed);
  border-radius: var(--radius);
  padding: 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.data-manage-box svg {
  width: 34px;
  height: 34px;
  flex: none;
  color: var(--accent);
}

.data-manage-title {
  font-family: var(--font-head);
  font-size: 1.05rem;
  color: var(--ink);
}

.data-manage-desc {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--text-3);
}

/* ================================================================
   主题一：memphis（默认变量已在 :root，此处覆盖拼贴特效）
   ================================================================ */
[data-theme="memphis"] .hero {
  transform: rotate(-0.6deg);
}

[data-theme="memphis"] .hero-box {
  background: var(--surface);
  border: var(--border);
  box-shadow: 8px 8px 0 var(--accent-3);
  padding: clamp(1.5rem, 4vw, 2.8rem);
}

[data-theme="memphis"] .hero-tape {
  display: block;
}

[data-theme="memphis"] .hero-badge {
  border: var(--border-thin);
  background: var(--bg);
  box-shadow: 2px 2px 0 var(--ink);
  padding: 0.3rem 0.7rem;
  color: var(--ink);
}

[data-theme="memphis"] .hero-title em {
  display: inline-block;
  background: var(--accent-3);
  border: var(--border-thin);
  box-shadow: 4px 4px 0 var(--accent-2);
  padding: 0 0.3em;
  transform: rotate(-1.5deg) scale(1.03);
}

[data-theme="memphis"] .deco-circle {
  display: block;
  top: -16px;
  right: 4%;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--accent-4);
  border: 3px solid var(--ink);
  box-shadow: 4px 4px 0 var(--ink);
  transform: rotate(6deg);
}

[data-theme="memphis"] .deco-triangle {
  display: block;
  bottom: -14px;
  left: 38%;
  width: 0;
  height: 0;
  border-left: 22px solid transparent;
  border-right: 22px solid transparent;
  border-bottom: 38px solid var(--accent-5);
  filter: drop-shadow(3px 3px 0 var(--ink));
}

[data-theme="memphis"] .empty-geom {
  display: flex;
}

/* ================================================================
   主题二：brutalism（索引表 + 分段按钮 + 单色）
   ================================================================ */
[data-theme="brutalism"] .hero {
  padding: 2rem 0 1.8rem;
  border-bottom: var(--border);
  margin-bottom: 0;
}

[data-theme="brutalism"] .hero-box {
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

[data-theme="brutalism"] .hero-badge {
  border: 1px solid var(--ink);
  background: var(--bg);
  padding: 2px 8px;
  color: var(--ink);
}

[data-theme="brutalism"] .hero-title {
  font-weight: 800;
  letter-spacing: -0.03em;
}

[data-theme="brutalism"] .hero-title em {
  color: var(--accent-2);
}

[data-theme="brutalism"] .hero-sub {
  color: var(--text-2);
  font-size: 15px;
}

[data-theme="brutalism"] .empty-geom {
  display: none;
}

/* brutalism 桌面端表格布局（≥900px） */
@media (min-width: 900px) {
  [data-theme="brutalism"] .card-grid {
    display: block;
    border: 1px solid var(--border);
    background: #fff;
  }

  [data-theme="brutalism"] .table-head {
    display: grid;
    grid-template-columns: 100px 2.5fr 1.5fr 90px 90px 90px 170px;
    gap: 14px;
    align-items: center;
    padding: 10px 16px;
    border: 1px solid var(--border);
    border-bottom: 2px solid var(--ink);
    background: #fff;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  [data-theme="brutalism"] .grid-cell {
    display: block;
  }

  [data-theme="brutalism"] .grid-end {
    text-align: left;
    font-size: 12px;
    margin-top: 0.8rem;
    padding: 0 16px;
  }
}

/* brutalism 小屏列表形态（<900px） */
@media (max-width: 899px) {
  [data-theme="brutalism"] .card-grid {
    display: block;
    border: 1px solid var(--border);
    background: #fff;
  }

  [data-theme="brutalism"] .grid-cell {
    display: block;
  }
}

/* ================================================================
   主题三：editorial（暖色出版物）
   ================================================================ */
[data-theme="editorial"] .hero {
  padding: 3rem 0 2.6rem;
  border-bottom: var(--border);
}

[data-theme="editorial"] .hero-box {
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

[data-theme="editorial"] .hero-badge {
  background: var(--accent-3);
  border: 1px solid var(--accent-4);
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  color: var(--accent-2);
  font-weight: 600;
  letter-spacing: 0.02em;
}

[data-theme="editorial"] .hero-title {
  letter-spacing: -0.02em;
}

[data-theme="editorial"] .hero-title em {
  color: var(--accent);
}

[data-theme="editorial"] .hero-sub {
  font-size: 1.02rem;
  line-height: 1.8;
}

[data-theme="editorial"] .empty-geom {
  display: none;
}

[data-theme="editorial"] .empty-box {
  border-radius: 14px;
}

/* ── 响应式 ── */
@media (max-width: 640px) {
  .card-grid {
    gap: 1.25rem;
  }

  .deco-circle,
  .deco-triangle {
    display: none !important;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions .btn-primary,
  .hero-actions .btn-secondary {
    width: 100%;
  }
}
</style>
