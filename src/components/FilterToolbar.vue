<script setup lang="ts">
// ================================================
// FilterToolbar — 搜索框 + 分类 chips + 计数 + 刷新
// 离线容器无 geolocation，距离筛选已移除（ADR-0003）
// ================================================

import { useItemsStore } from '@/stores/items'
import { CATEGORIES } from '@/lib/categories'

const store = useItemsStore()

defineEmits<{ refresh: [] }>()
</script>

<template>
  <section class="memphis-toolbar" aria-label="筛选工具栏">
    <!-- 第一行：搜索 / 计数 / 刷新 -->
    <div class="tool-row">
      <div class="search-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input v-model="store.search" class="search-input" type="search" placeholder="搜好物：名称、描述、楼号…"
          aria-label="搜索闲置物品" />
      </div>

      <div class="count-chip">共 {{ store.visibleItems.length }} 件</div>

      <button type="button" class="btn-tool-refresh" aria-label="刷新好物列表" @click="$emit('refresh')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          aria-hidden="true">
          <path d="M23 4v6h-6"></path>
          <path d="M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        刷新
      </button>
    </div>

    <!-- 第二行：分类 chips -->
    <div class="tool-row wrap">
      <div class="filter-btn-group" role="group" aria-label="分类筛选">
        <button v-for="c in CATEGORIES" :key="c.id" type="button" class="filter-chip cat-chip"
          :class="[`cat-${c.id}`, { active: store.category === c.id }]" :aria-pressed="store.category === c.id"
          @click="store.setCategory(c.id)">
          {{ c.label }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.memphis-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 5px 5px 0 var(--olive);
  padding: 0.9rem;
  margin-bottom: 2rem;
}

.tool-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.tool-row.wrap {
  flex-wrap: wrap;
}

/* 搜索框 */
.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  min-width: 180px;
  padding: 0 0.7rem;
  border: 2px solid var(--ink);
  background: #fff;
  transition: box-shadow 0.2s var(--ease);
}

.search-box:focus-within {
  box-shadow: 4px 4px 0 var(--retro-purple);
}

.search-box svg {
  flex: none;
  color: #888;
}

.search-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.92rem;
  line-height: 1.6;
  min-height: auto;
}

/* 计数 */
.count-chip {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  background: var(--royal-blue);
  color: #fff;
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  padding: 0.45rem 0.7rem;
}

@media (max-width: 640px) {
  .count-chip {
    margin-left: auto;
  }
}

/* 刷新 */
.btn-tool-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 44px;
  padding: 0 0.85rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
  background: var(--paper-cream);
  border: 2px solid var(--ink);
  box-shadow: 3px 3px 0 var(--retro-red);
  transition:
    transform 0.2s var(--ease),
    box-shadow 0.2s var(--ease),
    background var(--ease-snap);
}

.btn-tool-refresh:hover {
  background: var(--mustard);
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--retro-red);
}

/* chips 组 */
.filter-btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.filter-chip {
  min-height: 40px;
  padding: 0 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--paper-cream);
  border: 2px solid var(--ink);
  color: var(--ink);
  transition:
    transform 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    background var(--ease-snap),
    color var(--ease-snap);
}

.filter-chip:hover {
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ink);
}

.filter-chip.active {
  background: var(--ink);
  color: var(--mustard);
  transform: translate(1px, 1px);
  box-shadow: none;
}

/* 分类色点（激活态左侧小方块，孟菲斯撞色索引） */
.cat-chip::before {
  content: '';
  width: 8px;
  height: 8px;
  border: 1.5px solid currentColor;
  background: transparent;
}

.cat-home.cat-chip.active::before { background: var(--salmon); }
.cat-electronics.cat-chip.active::before { background: var(--royal-blue); }
.cat-kids.cat-chip.active::before { background: var(--retro-red); }
.cat-outdoor.cat-chip.active::before { background: var(--olive); }
.cat-tools.cat-chip.active::before { background: var(--mustard); }
.cat-books.cat-chip.active::before { background: var(--retro-purple); }
.cat-clothing.cat-chip.active::before { background: var(--retro-red); }
.cat-other.cat-chip.active::before,
.cat-all.cat-chip.active::before { background: var(--paper-cream); }
</style>
