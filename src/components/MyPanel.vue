<script setup lang="ts">
// ================================================
// MyPanel — 「我的发布 / 我的借用」双大卡入口（登录后显示，置于首屏）
// 点击跳转独立页面：/mine（上架/下架/删除）、/borrows（快速归还）
// ================================================

import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'

const store = useItemsStore()
const auth = useAuthStore()

/** 数量口径与页面一致：我的发布含已下架；我的借用含已下架（便于归还） */
const mineCount = computed(() => store.myItems.length)
const borrowedCount = computed(() => store.borrowedItems.length)
</script>

<template>
  <section v-if="auth.isLoggedIn" class="memphis-mypanel" aria-label="我的">
    <RouterLink to="/mine" class="mycard mine">
      <span class="mycard-head">
        <span class="mycard-title">我的发布</span>
        <span class="mycard-count" aria-label="共 {{ mineCount }} 件">{{ mineCount }}</span>
      </span>
      <span class="mycard-desc">上架 / 下架 / 删除</span>
    </RouterLink>

    <RouterLink to="/borrows" class="mycard borrowed">
      <span class="mycard-head">
        <span class="mycard-title">我的借用</span>
        <span class="mycard-count" aria-label="共 {{ borrowedCount }} 件">{{ borrowedCount }}</span>
      </span>
      <span class="mycard-desc">借来的好物，快速归还</span>
    </RouterLink>
  </section>
</template>

<style scoped>
.memphis-mypanel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
  margin-bottom: 1.2rem;
}

.mycard {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  padding: 0.75rem 0.85rem;
  transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease);
}

.mycard.mine {
  box-shadow: 5px 5px 0 var(--olive);
}

.mycard.borrowed {
  box-shadow: 5px 5px 0 var(--retro-red);
}

.mycard:hover {
  transform: translate(-1px, -1px);
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
  font-family: var(--font-serif);
  font-size: 1.02rem;
  font-weight: 700;
  white-space: nowrap;
}

.mycard-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
  border: 2px solid var(--ink);
  background: var(--mustard);
  color: var(--ink);
}

.mycard-desc {
  font-size: 0.72rem;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 360px) {
  .mycard-desc {
    display: none;
  }
}
</style>
