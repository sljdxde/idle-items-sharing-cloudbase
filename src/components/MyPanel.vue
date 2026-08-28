<script setup lang="ts">
// ================================================
// MyPanel — 「我的发布 / 我的借用」互斥视图切换（登录后显示）
// 置于页面靠上位置、与搜索框分离；点击其一自动取消另一个的高亮
// ================================================

import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'

const store = useItemsStore()
const auth = useAuthStore()
</script>

<template>
  <section v-if="auth.isLoggedIn" class="memphis-mypanel" aria-label="我的视图切换">
    <div class="mypanel-title">我的</div>
    <div class="mypanel-chips" role="group" aria-label="我的视图">
      <button
        type="button"
        class="filter-chip mine-chip"
        :class="{ active: store.onlyMine }"
        :aria-pressed="store.onlyMine"
        @click="store.toggleMine()"
      >
        我的发布
      </button>
      <button
        type="button"
        class="filter-chip borrowed-chip"
        :class="{ active: store.onlyBorrowed }"
        :aria-pressed="store.onlyBorrowed"
        @click="store.toggleBorrowed()"
      >
        我的借用
      </button>
    </div>
    <p class="mypanel-hint">「我的发布」含已下架物品，可重新上架；「我的借用」用于归还。</p>
  </section>
</template>

<style scoped>
.memphis-mypanel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 5px 5px 0 var(--retro-purple);
  padding: 0.8rem 0.9rem;
  margin-bottom: 1.2rem;
}

.mypanel-title {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--royal-blue);
  padding-right: 0.5rem;
  border-right: 2px solid var(--ink);
}

.mypanel-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.filter-chip {
  min-height: 40px;
  padding: 0 0.85rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
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

.mine-chip.active {
  background: var(--olive);
  color: var(--paper-cream);
}

.borrowed-chip.active {
  background: var(--retro-red);
  color: #fff;
}

.mypanel-hint {
  margin: 0;
  flex-basis: 100%;
  font-size: 0.75rem;
  color: #999;
}
</style>
