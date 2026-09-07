<script setup lang="ts">
// ================================================
// MinePage — 我的发布（/mine）：上架 / 下架 / 删除（删除为两次点击确认）
// ================================================

import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { formatDateShort, formatCount } from '@/lib/filters'
import { rentLabel, totalRent } from '@/lib/rent'
import type { Item } from '@/lib/types'
import LoginBox from '@/components/LoginBox.vue'

const store = useItemsStore()
const auth = useAuthStore()

/** 单件物品的累计租金收入 */
function rentIncome(it: Item): number {
  return totalRent(it.rentRecords)
}

/** 租金统计：总件数 / 收费件数 / 累计租金收入 */
const rentStats = computed(() => {
  const my = store.myItems
  const charged = my.filter((it) => it.rentType !== 'free')
  const total = charged.reduce((sum, it) => sum + rentIncome(it), 0)
  return { chargedCount: charged.length, total }
})

/** 两次点击确认删除：第一次进入待确认，3s 无操作自动还原 */
const confirmId = ref<number | null>(null)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  store.load()
})

function onDelete(item: Item): void {
  if (confirmId.value !== item.id) {
    confirmId.value = item.id
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirmId.value = null), 3000)
    return
  }
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmId.value = null
  void store.remove(item.id)
}

const statusText = (it: Item) => (it.archived ? '已下架' : it.status === 'lent' ? '已借出' : '可借')
const statusClass = (it: Item) => (it.archived ? 'pending' : it.status === 'lent' ? 'borrowed' : 'available')
</script>

<template>
  <main class="container mine-main">
    <RouterLink to="/" class="back-link">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
        aria-hidden="true">
        <path d="M15 18l-6-6 6-6"></path>
      </svg>
      返回首页
    </RouterLink>

    <div class="page-collage">
      <span class="hero-tape" aria-hidden="true"></span>
      <div class="page-head">
        <h1 class="page-title">我的发布</h1>
        <span class="count-chip">共 {{ formatCount(store.myItems.length) }} 件</span>
      </div>
      <p class="page-sub">上架 / 下架控制邻居可见性；删除会把物品从社区列表彻底移除，不可恢复。已借出的物品请先收回再删除。</p>

      <LoginBox v-if="!auth.isLoggedIn" />

      <template v-else>
        <div v-if="store.myItems.length === 0" class="empty-box">
          <h2 class="empty-title">你还没有发布过物品</h2>
          <p class="empty-desc">把闲置的好物分享给邻居吧。</p>
          <RouterLink to="/publish" class="btn-primary">发布第一件</RouterLink>
        </div>

        <div v-if="rentStats.chargedCount > 0" class="rent-stats">
          <span class="rent-stats-label">租金收入</span>
          <b class="rent-stats-total">¥{{ rentStats.total }}</b>
          <span class="rent-stats-sub">来自 {{ rentStats.chargedCount }} 件收费物品的归还结算（按天/按次）</span>
        </div>

        <ul v-else class="row-list">
          <li v-for="it in store.myItems" :key="it.id" class="row-card">
            <div class="row-head">
              <RouterLink :to="`/items/${it.id}`" class="row-name">{{ it.name }}</RouterLink>
              <span class="badge-status" :class="statusClass(it)">{{ statusText(it) }}</span>
            </div>
            <div class="row-meta">
              <span>{{ rentLabel(it) }}</span>
              <template v-if="rentIncome(it) > 0"> · 累计收入 <b class="income">¥{{ rentIncome(it) }}</b></template>
              · {{ formatDateShort(it.createTime) }} · {{ it.desc || '（无描述）' }}
            </div>
            <div class="row-actions">
              <button type="button" class="btn-sm" :disabled="store.writing"
                @click="store.setArchived(it.id, !it.archived)">
                {{ it.archived ? '上架' : '下架' }}
              </button>
              <button type="button" class="btn-sm danger" :class="{ arming: confirmId === it.id }"
                :disabled="store.writing || it.status === 'lent'" @click="onDelete(it)">
                {{ it.status === 'lent' ? '借出中不可删' : confirmId === it.id ? '确认删除？' : '删除' }}
              </button>
              <RouterLink :to="`/items/${it.id}`" class="btn-sm ghost">详情</RouterLink>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </main>
</template>

<style scoped>
.mine-main {
  padding-top: 0.75rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  min-height: 44px;
  padding: 0 0.4rem;
  color: var(--ink);
}

/* ── 页面外壳 ── */
.page-collage {
  position: relative;
  max-width: 760px;
  margin: 0 auto;
  background: var(--surface);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius);
  padding: clamp(1.3rem, 3.5vw, 2.2rem);
}

.hero-tape {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 92px;
  height: 22px;
  background: var(--accent-3);
  opacity: 0.75;
  border: 1px solid var(--ink);
  z-index: 5;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}

.page-title {
  font-family: var(--font-head);
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--ink);
}

.count-chip {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  background: var(--accent-6);
  color: var(--ink);
  border: var(--border-thin);
  box-shadow: var(--shadow-soft);
  padding: 0.45rem 0.7rem;
  border-radius: var(--radius-sm);
}

.page-sub {
  color: var(--text-2);
  font-size: 0.88rem;
  margin-bottom: 1.4rem;
  max-width: 46em;
}

/* ── 空状态 ── */
.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
  padding: 2rem 1rem;
  border: var(--border-dashed);
  background: var(--photo-bg);
  border-radius: var(--radius);
  text-align: center;
}

.empty-title {
  font-family: var(--font-head);
  font-size: 1.3rem;
  color: var(--ink);
}

.empty-desc {
  color: var(--text-2);
  font-size: 0.9rem;
}

/* ── 租金统计 ── */
.rent-stats {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  background: var(--surface);
  border: var(--border-thin);
  border-radius: var(--radius);
  padding: 0.8rem 1rem;
  margin-bottom: 1rem;
}

.rent-stats-label {
  font-size: 0.82rem;
  color: var(--text-2);
}

.rent-stats-total {
  font-family: var(--font-mono);
  font-size: 1.3rem;
  color: var(--accent);
}

.rent-stats-sub {
  font-size: 0.78rem;
  color: var(--text-3);
}

/* ── 列表 ── */
.row-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.row-card {
  background: var(--card-bg);
  border: var(--card-border);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius);
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.row-name {
  font-family: var(--font-head);
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--ink);
}

.row-name:hover {
  color: var(--accent);
}

.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em 1.1em;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-2);
}

.row-meta .income {
  color: var(--accent);
  font-weight: 700;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* ── 小按钮 ── */
.btn-sm {
  min-height: 36px;
  padding: 0 0.9rem;
  font-size: 0.82rem;
  font-weight: 700;
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-ink);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
}

.btn-sm:hover:not(:disabled) {
  box-shadow: 2px 2px 0 var(--accent);
}

.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm.danger {
  color: var(--accent-2);
}

.btn-sm.danger.arming {
  background: var(--ink);
  color: var(--accent-3);
  border-color: var(--ink);
}

.btn-sm.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--accent-4);
  box-shadow: none;
}

/* ================================================================
   主题差异化
   ================================================================ */
[data-theme="memphis"] .page-collage {
  transform: rotate(-0.35deg);
}

[data-theme="memphis"] .hero-tape {
  display: block;
}

[data-theme="brutalism"] .hero-tape,
[data-theme="editorial"] .hero-tape {
  display: none;
}

[data-theme="editorial"] .page-collage {
  border-radius: 14px;
  box-shadow: var(--shadow-1);
}

[data-theme="editorial"] .empty-box {
  border-radius: 14px;
}
</style>
