<script setup lang="ts">
// ================================================
// DetailPage — 物品详情（/items/:id）：大图 + 全量信息 + 借/管操作
// ================================================

import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { calcDistance, formatDateShort, formatDistance } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'
import type { Item } from '@/lib/types'
import BorrowModal from '@/components/BorrowModal.vue'
import ManageModal from '@/components/ManageModal.vue'

const route = useRoute()
const store = useItemsStore()

const borrowOpen = ref(false)
const manageOpen = ref(false)

onMounted(async () => {
  if (!store.loaded) await store.load()
})

const item = computed<Item | null>(() => {
  const id = Number(route.params.id)
  return Number.isFinite(id) ? (store.itemById(id) ?? null) : null
})

const categoryLabel = computed(() => {
  const c = item.value && CATEGORIES.find((x) => x.id === item.value!.category)
  return c ? c.label : '其他'
})

const distanceText = computed(() => {
  const it = item.value
  if (!it || !store.userLoc || it.lat == null || it.lng == null) return null
  return formatDistance(calcDistance(store.userLoc.lat, store.userLoc.lng, it.lat, it.lng))
})
</script>

<template>
  <main class="memphis-container detail-main">
    <RouterLink to="/" class="back-link">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
        aria-hidden="true">
        <path d="M15 18l-6-6 6-6"></path>
      </svg>
      返回列表
    </RouterLink>

    <!-- 未找到 / 加载中 -->
    <div v-if="!item" class="missing-box">
      <h1 class="head-title">{{ store.loading && !store.loaded ? '正在加载…' : '没有这件物品' }}</h1>
      <p class="empty-desc">它可能已下架，或链接有误。</p>
      <RouterLink to="/" class="btn-memphis-secondary">回首页逛逛</RouterLink>
    </div>

    <article v-else class="detail-collage">
      <span class="hero-tape" aria-hidden="true"></span>

      <div class="photo-side">
        <img v-if="item.imgUrl" :src="item.imgUrl" :alt="item.name" class="detail-photo" />
        <div v-else class="detail-photo placeholder">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
            aria-hidden="true">
            <rect x="3" y="3" width="18" height="18"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span>实物图</span>
        </div>
        <span class="badge-status float-badge"
          :class="item.status === 'borrowed' ? 'borrowed' : item.status === 'requested' ? 'pending' : 'available'">
          {{ item.status === 'available' ? '闲置中' : item.status === 'requested' ? '待确认' : '已借出' }}
        </span>
      </div>

      <div class="info-side">
        <p class="meta-mono">{{ categoryLabel }} · {{ formatDateShort(item.createTime) }}</p>
        <h1 class="head-title">{{ item.name }}</h1>
        <p class="desc-text">{{ item.desc || '（无描述）' }}</p>

        <dl class="detail-rows">
          <div v-if="distanceText" class="detail-row">
            <dt>距您</dt>
            <dd>{{ distanceText }}</dd>
          </div>
          <div v-if="item.building" class="detail-row">
            <dt>楼号</dt>
            <dd>{{ item.building }}</dd>
          </div>
          <div v-if="item.contact" class="detail-row">
            <dt>联系方式</dt>
            <dd>{{ item.contact }}</dd>
          </div>
        </dl>

        <div class="action-row">
          <button type="button" class="btn-memphis-primary" :disabled="item.status === 'borrowed'"
            @click="borrowOpen = true">
            {{ item.status === 'borrowed' ? '已借出' : '我想借' }}
          </button>
          <button type="button" class="btn-memphis-secondary" @click="manageOpen = true">管理此物品</button>
        </div>
      </div>
    </article>

    <BorrowModal :open="borrowOpen" :item="item" @close="borrowOpen = false" />
    <ManageModal :open="manageOpen" :item="item" @close="manageOpen = false" />
  </main>
</template>

<style scoped>
.detail-main {
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

.back-link:hover {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}

.missing-box {
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 6px 6px 0 var(--salmon);
  padding: 3rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
  transform: rotate(-0.4deg);
}

.detail-collage {
  position: relative;
  margin-top: 0.75rem;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 8px 8px 0 var(--retro-purple);
  padding: clamp(1.2rem, 3vw, 2rem);
  transform: rotate(-0.4deg);
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 800px) {
  .detail-collage {
    grid-template-columns: minmax(280px, 420px) 1fr;
    align-items: start;
  }
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

.photo-side {
  position: relative;
}

.detail-photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border: 2.5px solid var(--ink);
  box-shadow: 5px 5px 0 var(--mustard);
  transform: rotate(0.8deg);
}

.detail-photo.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background: #f1ece1;
  color: var(--ink);
}

.detail-photo.placeholder span {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  border: 1.5px solid var(--ink);
  background: var(--paper-cream);
  padding: 0.2rem 0.6rem;
}

.float-badge {
  position: absolute;
  top: -10px;
  left: -8px;
  z-index: 6;
  transform: rotate(-4deg);
}

.meta-mono {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--royal-blue);
  margin-bottom: 0.4rem;
}

.head-title {
  font-family: var(--font-serif);
  font-size: clamp(1.7rem, 4vw, 2.4rem);
  line-height: 1.2;
  text-wrap: balance;
  margin-bottom: 0.7rem;
}

.desc-text {
  max-width: 36em;
  color: #333;
  line-height: 1.8;
  margin-bottom: 1.2rem;
}

.detail-rows {
  border-top: 2px dashed var(--ink);
  margin-bottom: 1.4rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0.15rem;
  border-bottom: 1.5px dashed rgba(29, 30, 44, 0.25);
}

.detail-row dt {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: #777;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}
</style>
