<script setup lang="ts">
// ================================================
// MinePage — 我的发布（/mine）：上架 / 下架 / 删除（删除为两次点击确认）
// ================================================

import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { formatDateShort, formatCount } from '@/lib/filters'
import type { Item } from '@/lib/types'
import LoginBox from '@/components/LoginBox.vue'

const store = useItemsStore()
const auth = useAuthStore()

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
  <main class="memphis-container mine-main">
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
      <p class="page-sub">上架 / 下架控制邻居可见性；删除会把物品从社区列表彻底移除，不可恢复。</p>

      <LoginBox v-if="!auth.isLoggedIn" />

      <template v-else>
        <div v-if="store.myItems.length === 0" class="empty-box">
          <h2 class="empty-title">你还没有发布过物品</h2>
          <p class="empty-desc">把闲置的好物分享给邻居吧。</p>
          <RouterLink to="/publish" class="btn-memphis-primary">发布第一件</RouterLink>
        </div>

        <ul v-else class="row-list">
          <li v-for="it in store.myItems" :key="it.id" class="row-card">
            <div class="row-head">
              <RouterLink :to="`/items/${it.id}`" class="row-name">{{ it.name }}</RouterLink>
              <span class="badge-status" :class="statusClass(it)">{{ statusText(it) }}</span>
            </div>
            <div class="row-meta">{{ formatDateShort(it.createTime) }} · {{ it.desc || '（无描述）' }}</div>
            <div class="row-actions">
              <button type="button" class="btn-act" :disabled="store.writing"
                @click="store.setArchived(it.id, !it.archived)">
                {{ it.archived ? '上架' : '下架' }}
              </button>
              <button type="button" class="btn-act danger" :class="{ arming: confirmId === it.id }"
                :disabled="store.writing" @click="onDelete(it)">
                {{ confirmId === it.id ? '确认删除？' : '删除' }}
              </button>
              <RouterLink :to="`/items/${it.id}`" class="btn-act ghost">详情</RouterLink>
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
}

.page-collage {
  position: relative;
  max-width: 720px;
  margin: 0 auto;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 8px 8px 0 var(--olive);
  padding: clamp(1.4rem, 3.5vw, 2.2rem);
  transform: rotate(-0.35deg);
}

.hero-tape {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 92px;
  height: 22px;
  background: rgba(233, 196, 106, 0.75);
  border: 1px solid var(--ink);
  z-index: 5;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.page-title {
  font-family: var(--font-serif);
  font-size: clamp(1.6rem, 4vw, 2.2rem);
}

.count-chip {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  background: var(--olive);
  color: #fff;
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  padding: 0.45rem 0.7rem;
}

.page-sub {
  margin: 0.4rem 0 1.4rem;
  font-size: 0.85rem;
  color: #777;
}

.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
  padding: 2rem 1rem;
  border: 2.5px dashed var(--ink);
  background: var(--bg-cream);
  text-align: center;
}

.empty-title {
  font-family: var(--font-serif);
  font-size: 1.3rem;
}

.empty-desc {
  color: #666;
  font-size: 0.9rem;
}

.row-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.row-card {
  border: 2.5px solid var(--ink);
  background: var(--bg-cream);
  box-shadow: 4px 4px 0 var(--mustard);
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.row-name {
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 700;
}

.row-name:hover {
  text-decoration: underline;
  text-decoration-color: var(--mustard);
  text-decoration-thickness: 3px;
  text-underline-offset: 4px;
}

.row-meta {
  font-size: 0.8rem;
  color: #777;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-act {
  min-height: 40px;
  padding: 0 0.9rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  border: 2px solid var(--ink);
  background: var(--paper-cream);
  color: var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  transition: background var(--ease-snap), transform 0.15s var(--ease);
}

.btn-act:hover:not(:disabled) {
  background: var(--mustard);
  transform: translate(-1px, -1px);
}

.btn-act:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-act.danger {
  background: var(--retro-red);
  color: #fff;
}

.btn-act.danger:hover:not(:disabled) {
  background: var(--ink);
}

.btn-act.danger.arming {
  background: var(--ink);
  color: var(--mustard);
}

.btn-act.ghost {
  display: inline-flex;
  align-items: center;
  box-shadow: none;
  border-color: transparent;
  color: var(--royal-blue);
}
</style>
