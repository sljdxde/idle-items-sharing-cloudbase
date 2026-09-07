<script setup lang="ts">
// ================================================
// BorrowsPage — 我的借用（/borrows）：快速归还
// ================================================

import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { contactRows } from '@/lib/contact'
import { formatCount } from '@/lib/filters'
import type { Item } from '@/lib/types'
import LoginBox from '@/components/LoginBox.vue'

const store = useItemsStore()
const auth = useAuthStore()

onMounted(() => {
  store.load()
})

const ownerContact = (it: Item) => {
  const rows = contactRows(it)
  return rows.length ? rows.map((r) => `${r.label} ${r.value}`).join(' · ') : '联系方式见详情'
}
</script>

<template>
  <main class="container borrow-main">
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
        <h1 class="page-title">我的借用</h1>
        <span class="count-chip">共 {{ formatCount(store.borrowedItems.length) }} 件</span>
      </div>
      <p class="page-sub">用完记得归还，让好物继续流转。换设备登录同一手机号即可看到自己的借用。</p>

      <LoginBox v-if="!auth.isLoggedIn" />

      <template v-else>
        <div v-if="store.borrowedItems.length === 0" class="empty-box">
          <h2 class="empty-title">你还没有借用的物品</h2>
          <p class="empty-desc">去列表里逛逛，看到心仪的好物点「我想借」吧。</p>
          <RouterLink to="/" class="btn-secondary">去逛逛</RouterLink>
        </div>

        <ul v-else class="row-list">
          <li v-for="it in store.borrowedItems" :key="it.id" class="row-card">
            <div class="row-head">
              <RouterLink :to="`/items/${it.id}`" class="row-name">{{ it.name }}</RouterLink>
              <span class="badge-status" :class="it.archived ? 'pending' : 'borrowed'">
                {{ it.archived ? '已下架' : '已借出' }}
              </span>
            </div>
            <div class="row-meta">物主联系：{{ ownerContact(it) }}</div>
            <div class="row-actions">
              <button type="button" class="btn-sm return" :disabled="store.writing"
                @click="store.returnBack(it.id)">
                我要归还
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
.borrow-main {
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
  background: var(--accent-2);
  color: var(--accent-ink);
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

.btn-sm.return {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-ink);
  border-color: var(--ink);
}

.btn-sm.return:hover:not(:disabled) {
  background: var(--accent-2);
  box-shadow: 3px 3px 0 var(--ink);
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
