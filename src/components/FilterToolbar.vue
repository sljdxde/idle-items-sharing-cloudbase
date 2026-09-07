<script setup lang="ts">
// ================================================
// FilterToolbar — 搜索框 + 分类 chips + 距离/状态筛选 + 定位状态 + 刷新
// 距离 x 公里为可配置参数（geo.ts 的 RADIUS_OPTIONS / DEFAULT_RADIUS_KM）
// ================================================

import { useItemsStore } from '@/stores/items'
import { CATEGORIES } from '@/lib/categories'
import { RADIUS_OPTIONS } from '@/lib/geo'
import { formatCount } from '@/lib/filters'
import { useToast } from '@/composables/useToast'

const store = useItemsStore()
const toast = useToast()

defineEmits<{ refresh: [] }>()

async function onLocate(): Promise<void> {
  const r = await store.locate()
  if (r === 'ok') {
    toast.success('定位成功', '列表已按离你最近的距离排序')
    return
  }
  const tip =
    r === 'insecure'
      ? '当前为 HTTP 访问，浏览器禁用了定位。可选「全部距离」浏览，或改用 HTTPS 地址访问'
      : r === 'denied'
        ? '请在浏览器设置中允许本站获取位置，或选择「全部距离」浏览'
        : '定位超时，可到窗边重试，或选择「全部距离」浏览'
  toast.warning('定位失败', tip)
}
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

      <div class="count-chip">共 {{ formatCount(store.visibleItems.length) }} 件</div>

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

    <!-- 第三行：距离 + 定位 + 状态 + 我的 -->
    <div class="tool-row wrap">
      <label class="radius-select-box">
        <span class="radius-label">距离</span>
        <select
          class="memphis-select radius-select"
          :value="store.radiusKm"
          aria-label="距离筛选"
          @change="store.setRadius(($event.target as HTMLSelectElement).value === 'all' ? 'all' : Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="o in RADIUS_OPTIONS" :key="String(o.value)" :value="o.value">
            {{ o.label }}
          </option>
        </select>
      </label>

      <button type="button" class="filter-chip loc-chip" :class="{ active: !!store.userPosition }"
        :aria-pressed="!!store.userPosition" @click="onLocate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <template v-if="store.locating">定位中…</template>
        <template v-else-if="store.userPosition">已定位</template>
        <template v-else>获取定位</template>
      </button>

      <button type="button" class="filter-chip lent-chip" :class="{ active: store.showLent }"
        :aria-pressed="store.showLent" @click="store.showLent = !store.showLent">
        显示已借出
      </button>
    </div>

    <!-- 未定位提示：距离筛选暂不生效 -->
    <p v-if="store.radiusKm !== 'all' && !store.userPosition" class="loc-hint" role="status">
      尚未获取你的定位，距离筛选暂未生效——点击「获取定位」或改选「全部距离」。
    </p>
  </section>
</template>

<style scoped>
/* ── 默认（memphis）工具栏样式 ── */
.memphis-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  background: var(--toolbar-bg);
  border: var(--toolbar-border);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius);
  padding: 1.1rem;
  margin-bottom: 2.5rem;
}

.tool-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.tool-row.wrap {
  flex-wrap: wrap;
}

/* 搜索框 */
.search-box {
  flex: 1 1 220px;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  min-width: 0;
  padding: 0 0.7rem;
  background: var(--input-bg);
  border: var(--input-border);
  border-radius: var(--radius-sm);
  transition: box-shadow 0.2s var(--ease);
}

.search-box:focus-within {
  box-shadow: 3px 3px 0 var(--accent);
}

.search-box svg {
  flex: none;
  color: var(--text-3);
}

.search-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.92rem;
  line-height: 1.6;
  min-height: auto;
  color: var(--ink);
}

/* 计数 */
.count-chip {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  background: var(--accent);
  color: var(--accent-ink);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
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
  gap: 0.4rem;
  min-height: 40px;
  padding: 0 0.85rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-ink);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
  transition:
    background 0.15s,
    box-shadow 0.15s;
}

.btn-tool-refresh:hover {
  background: var(--hover-bg);
  box-shadow: 2px 2px 0 var(--accent);
}

/* chips 组 */
.filter-btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-chip {
  min-height: 38px;
  padding: 0 0.9rem;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 600;
  background: var(--chip-bg);
  color: var(--ink);
  border: var(--chip-border);
  border-radius: var(--radius-sm);
  transition:
    background 0.15s,
    color 0.15s,
    box-shadow 0.15s;
}

.filter-chip:hover {
  box-shadow: 2px 2px 0 var(--accent);
}

.filter-chip.active {
  background: var(--chip-active-bg);
  color: var(--chip-active-ink);
}

/* 分类色点（激活态左侧小方块，孟菲斯撞色索引） */
.cat-chip::before {
  content: '';
  width: 8px;
  height: 8px;
  border: 1.5px solid currentColor;
  background: transparent;
}

.cat-home.cat-chip.active::before { background: var(--accent-5); }
.cat-electronics.cat-chip.active::before { background: var(--accent-4); }
.cat-kids.cat-chip.active::before { background: var(--accent-2); }
.cat-outdoor.cat-chip.active::before { background: var(--accent-6); }
.cat-tools.cat-chip.active::before { background: var(--accent-3); }
.cat-books.cat-chip.active::before { background: var(--accent); }
.cat-clothing.cat-chip.active::before { background: var(--accent-2); }
.cat-other.cat-chip.active::before,
.cat-all.cat-chip.active::before { background: var(--surface); }

/* 距离下拉 */
.radius-select-box {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.radius-label {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-2);
}

.radius-select {
  min-height: 40px;
  min-width: 120px;
  padding: 0 0.7rem;
  background: var(--input-bg);
  color: var(--ink);
  border: var(--input-border);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 600;
}

.loc-chip,
.lent-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

/* 未定位提示 */
.loc-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-3);
}

/* ── brutalism 主题覆盖 ── */
[data-theme="brutalism"] .memphis-toolbar {
  border: none;
  box-shadow: none;
  padding: 0.8rem 0;
  border-bottom: var(--border);
  border-radius: 0;
  margin-bottom: 1.6rem;
}

[data-theme="brutalism"] .search-box {
  border: var(--border);
}

[data-theme="brutalism"] .search-box:focus-within {
  box-shadow: none;
  border-color: var(--ink);
}

[data-theme="brutalism"] .count-chip {
  background: transparent;
  color: var(--text-2);
  border: none;
  padding: 0;
  font-size: 13px;
}

[data-theme="brutalism"] .btn-tool-refresh {
  border: var(--border);
  font-size: 12px;
}

[data-theme="brutalism"] .btn-tool-refresh:hover {
  background: var(--surface-2);
  box-shadow: none;
  border-color: var(--ink);
}

[data-theme="brutalism"] .filter-btn-group {
  border: var(--border);
  background: #fff;
  gap: 0;
}

[data-theme="brutalism"] .filter-chip {
  border: none;
  border-right: var(--border);
  border-radius: 0;
  min-height: 36px;
  font-size: 12px;
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text-2);
}

[data-theme="brutalism"] .filter-chip:last-child {
  border-right: none;
}

[data-theme="brutalism"] .filter-chip:hover {
  box-shadow: none;
  background: var(--surface-2);
  color: var(--ink);
}

[data-theme="brutalism"] .filter-chip.active {
  background: var(--ink);
  color: #fff;
  font-weight: 700;
}

[data-theme="brutalism"] .radius-select {
  border: var(--border);
  min-height: 36px;
  font-size: 12px;
}

[data-theme="brutalism"] .loc-hint {
  font-family: var(--font-mono);
  font-size: 12px;
}

/* ── editorial 主题覆盖 ── */
[data-theme="editorial"] .memphis-toolbar {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(43, 38, 34, 0.04);
  padding: 1.2rem 1.4rem;
}

[data-theme="editorial"] .search-box {
  border-radius: 8px;
}

[data-theme="editorial"] .search-box:focus-within {
  box-shadow: 0 0 0 2px var(--accent-4);
}

[data-theme="editorial"] .count-chip {
  background: transparent;
  color: var(--text-3);
  border: none;
  font-family: var(--font-head);
  padding: 0;
  font-size: 0.88rem;
}

[data-theme="editorial"] .btn-tool-refresh {
  border-radius: 6px;
}

[data-theme="editorial"] .filter-chip {
  border-radius: 6px;
  min-height: 40px;
  font-size: 0.875rem;
}

[data-theme="editorial"] .filter-chip:hover {
  border-color: var(--accent);
  color: var(--accent-2);
  background: color-mix(in srgb, var(--accent-2) 4%, transparent);
  box-shadow: none;
}

[data-theme="editorial"] .filter-chip.active {
  box-shadow: 0 2px 6px rgba(204, 120, 92, 0.25);
}

[data-theme="editorial"] .radius-select {
  border-radius: 6px;
  min-height: 40px;
}
</style>
