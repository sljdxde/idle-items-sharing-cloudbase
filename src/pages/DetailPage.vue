<script setup lang="ts">
// ================================================
// DetailPage — 物品详情（/items/:id）：大图 + 全量信息 + 按角色的借/还/管操作
// ================================================

import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { formatDateShort } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'
import { canReturn, isOwner } from '@/lib/itemOps'
import { contactRows } from '@/lib/contact'
import type { Item } from '@/lib/types'
import BorrowModal from '@/components/BorrowModal.vue'
import ManageModal from '@/components/ManageModal.vue'

const route = useRoute()
const store = useItemsStore()
const auth = useAuthStore()

const borrowOpen = ref(false)
const manageOpen = ref(false)

onMounted(() => {
  store.load()
})

const item = computed<Item | null>(() => {
  const id = Number(route.params.id)
  return Number.isFinite(id) ? (store.itemById(id) ?? null) : null
})

const categoryLabel = computed(() => {
  const c = item.value && CATEGORIES.find((x) => x.id === item.value!.category)
  return c ? c.label : '其他'
})

const ownerIsMe = computed(() => (item.value ? isOwner(item.value, auth.phone) : false))
const mineLent = computed(() => (item.value ? canReturn(item.value, auth.phone) : false))

const distLabel = computed(() => (item.value ? store.distanceLabel(item.value) : null))

const borrowerMasked = computed(() => {
  const p = item.value?.borrowedBy
  return p ? p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''
})

const statusText = computed(() => {
  const it = item.value
  if (!it) return ''
  if (it.archived) return '已下架'
  return it.status === 'lent' ? '已借出' : '可借'
})

/** 联系方式行：楼牌号在前、手机号在后 */
const contactRowsList = computed(() => (item.value ? contactRows(item.value) : []))
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

    <!-- 未找到 -->
    <div v-if="!item" class="missing-box">
      <h1 class="head-title">没有这件物品</h1>
      <p class="empty-desc">它可能已被下架，或链接有误。</p>
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
          <span>小主没有上传图片哦</span>
        </div>
        <span class="badge-status float-badge"
          :class="item.archived ? 'pending' : item.status === 'lent' ? 'borrowed' : 'available'">
          {{ statusText }}
        </span>
      </div>

      <div class="info-side">
        <p class="meta-mono">
          {{ categoryLabel }} · {{ formatDateShort(item.createTime) }}
          <template v-if="distLabel"> · 距你 {{ distLabel }}</template>
        </p>
        <h1 class="head-title">{{ item.name }}</h1>
        <p class="desc-text">{{ item.desc || '（无描述）' }}</p>

        <dl class="detail-rows">
          <div v-for="row in contactRowsList" :key="row.label" class="detail-row">
            <dt>{{ row.label }}</dt>
            <dd class="selectable">{{ row.value }}</dd>
          </div>
          <div v-if="contactRowsList.length === 0" class="detail-row">
            <dt>联系方式</dt>
            <dd>未填写</dd>
          </div>
          <div v-if="ownerIsMe && item.borrowedBy" class="detail-row">
            <dt>借阅人手机号</dt>
            <dd class="selectable">{{ borrowerMasked }}</dd>
          </div>
          <div v-if="item.archived" class="detail-row">
            <dt>状态</dt>
            <dd>已下架（仅发布者可见）</dd>
          </div>
        </dl>

        <div class="action-row">
          <!-- 物主：管理 + 上下架 -->
          <template v-if="ownerIsMe">
            <button type="button" class="btn-memphis-primary" @click="manageOpen = true">
              管理此物品
            </button>
            <button type="button" class="btn-memphis-secondary" :disabled="store.writing"
              @click="store.setArchived(item.id, !item.archived)">
              {{ item.archived ? '重新上架' : '下架' }}
            </button>
          </template>

          <!-- 借阅人本人：归还 -->
          <button v-else-if="mineLent" type="button" class="btn-memphis-primary" :disabled="store.writing"
            @click="store.returnBack(item.id)">
            我要归还
          </button>

          <!-- 其他人：借用（未登录也允许点击，弹窗内提供登录，与首页卡片行为一致） -->
          <button v-else type="button" class="btn-memphis-primary"
            :disabled="item.status === 'lent' || item.archived || store.writing"
            @click="borrowOpen = true">
            {{ item.status === 'lent' ? '已借出' : item.archived ? '已下架' : '我想借' }}
          </button>
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

@media (max-width: 640px) {
  .action-row .btn-memphis-primary,
  .action-row .btn-memphis-secondary {
    flex: 1 1 100%;
  }
}

/* 联系方式保持可选中，供长按手动复制 */
.selectable {
  -webkit-user-select: text;
  user-select: text;
}
</style>
