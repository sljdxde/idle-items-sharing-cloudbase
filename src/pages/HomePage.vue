<script setup lang="ts">
// ================================================
// HomePage — Hero 拼贴 + 工具栏（搜索/分类）+ 卡片网格
// 数据来自本地存储，加载即时完成，无网络态
// ================================================

import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useToast } from '@/composables/useToast'
import type { Item } from '@/lib/types'
import FilterToolbar from '@/components/FilterToolbar.vue'
import ItemCard from '@/components/ItemCard.vue'
import BorrowModal from '@/components/BorrowModal.vue'
import ManageModal from '@/components/ManageModal.vue'

const store = useItemsStore()
const toast = useToast()

const borrowItem = ref<Item | null>(null)
const manageItem = ref<Item | null>(null)

onMounted(() => {
  store.load()
})

function onRefresh(): void {
  store.load()
  toast.success('已刷新', '数据已从本机重新载入')
}
</script>

<template>
  <main class="memphis-container home-main">
    <!-- Hero：拼贴卡 -->
    <section class="memphis-hero">
      <div class="hero-collage-card">
        <span class="hero-tape t1" aria-hidden="true"></span>
        <span class="hero-tape t2" aria-hidden="true"></span>
        <div class="hero-badge-pill">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            aria-hidden="true">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          社区闲置 · 互助共享 · 离线可用
        </div>
        <h1 class="hero-headline">让好物在<span class="retro-tag">邻里间流转</span></h1>
        <p class="hero-subhead">发现邻居的闲置好物，借用或分享，让每一件物品继续发挥价值。数据保存在你的设备上。</p>
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

    <!-- 工具栏：搜索 / 分类 / 刷新 -->
    <FilterToolbar @refresh="onRefresh" />

    <!-- 空状态 -->
    <div v-if="store.visibleItems.length === 0" class="empty-box">
      <div class="empty-geom" aria-hidden="true">
        <span class="e-sq"></span><span class="e-ci"></span><span class="e-tr"></span>
      </div>
      <template v-if="store.search || store.category !== 'all'">
        <h2 class="empty-title">没找到匹配的好物</h2>
        <p class="empty-desc">换个关键词，或清除筛选条件试试。</p>
        <button type="button" class="btn-memphis-secondary"
          @click="store.search = ''; store.setCategory('all')">清除筛选</button>
      </template>
      <template v-else>
        <h2 class="empty-title">暂无闲置物品</h2>
        <p class="empty-desc">成为第一个分享好物的人吧。</p>
        <RouterLink to="/publish" class="btn-memphis-primary">发布第一件</RouterLink>
      </template>
    </div>

    <!-- 网格 -->
    <section id="item-grid" class="memphis-grid" aria-label="闲置物品列表">
      <TransitionGroup name="grid">
        <div v-for="(item, i) in store.visibleItems" :key="item.id" class="grid-cell">
          <ItemCard :item="item" :index="i" @borrow="borrowItem = $event" @manage="manageItem = $event" />
        </div>
      </TransitionGroup>
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
</style>
