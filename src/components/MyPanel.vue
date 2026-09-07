<script setup lang="ts">
// ================================================
// MyPanel — 「我的发布 / 我的借用」双大卡入口（登录后显示，置于首屏）
// 点击跳转独立页面：/mine（上架/下架/删除）、/borrows（快速归还）
// ================================================

import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { formatCount } from '@/lib/filters'

const store = useItemsStore()
const auth = useAuthStore()

/** 数量口径与页面一致：我的发布含已下架；我的借用含已下架（便于归还） */
const mineCount = computed(() => store.myItems.length)
const borrowedCount = computed(() => store.borrowedItems.length)
const mineCountText = computed(() => formatCount(mineCount.value))
const borrowedCountText = computed(() => formatCount(borrowedCount.value))
</script>

<template>
  <section v-if="auth.isLoggedIn" class="memphis-mypanel" aria-label="我的">
    <RouterLink to="/mine" class="mycard mine">
      <span class="mycard-head">
        <span class="mycard-title">我的发布</span>
        <span class="mycard-count" :aria-label="`共 ${mineCount} 件`">{{ mineCountText }}</span>
      </span>
      <span class="mycard-desc">上架 / 下架 / 删除</span>
    </RouterLink>

    <RouterLink to="/borrows" class="mycard borrowed">
      <span class="mycard-head">
        <span class="mycard-title">我的借用</span>
        <span class="mycard-count" :aria-label="`共 ${borrowedCount} 件`">{{ borrowedCountText }}</span>
      </span>
      <span class="mycard-desc">借来的好物，快速归还</span>
    </RouterLink>
  </section>
</template>

<style scoped>
.memphis-mypanel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.875rem;
  margin-bottom: 2rem;
}

.mycard {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  text-align: left;
  background: var(--card-bg);
  border: var(--card-border);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius);
  padding: 0.8rem 1rem;
  transition: transform 0.15s, box-shadow 0.15s;
}

.mycard:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-1);
}

.mycard:active {
  transform: translate(1px, 1px);
}

.mycard-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.mycard-title {
  font-family: var(--font-head);
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
}

.mycard-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.7rem;
  height: 1.7rem;
  padding: 0 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
  background: var(--accent);
  color: var(--accent-ink);
  border: var(--border-thin);
}

.mycard-desc {
  font-size: 0.74rem;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 640px) {
  .memphis-mypanel {
    gap: 0.6rem;
    margin-bottom: 1.5rem;
  }

  .mycard {
    padding: 0.7rem 0.8rem;
  }

  .mycard-desc {
    display: none;
  }
}
</style>
