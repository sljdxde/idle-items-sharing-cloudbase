<script setup lang="ts">
// ================================================
// DetailPage — 物品详情（/items/:id）：大图 + 全量信息 + 按角色的借/还/管操作
// ================================================

import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { formatDateShort } from '@/lib/filters'
import { CATEGORIES } from '@/lib/categories'
import { contactRows } from '@/lib/contact'
import { safeImgUrl } from '@/lib/safeImage'
import { reverseGeocode } from '@/lib/geocode'
import { itemLatLng } from '@/lib/geo'
import { rentLabel } from '@/lib/rent'
import type { Item } from '@/lib/types'
import BorrowModal from '@/components/BorrowModal.vue'
import ManageModal from '@/components/ManageModal.vue'

const route = useRoute()
const store = useItemsStore()

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

const ownerIsMe = computed(() => (item.value ? store.owns(item.value) : false))
const mineLent = computed(() => (item.value ? store.holds(item.value) : false))
const photoUrl = computed(() => (item.value ? safeImgUrl(item.value.imgUrl) : ''))
const distLabel = computed(() => (item.value ? store.distanceLabel(item.value) : null))

const statusText = computed(() => {
  const it = item.value
  if (!it) return ''
  if (it.archived) return '已下架'
  return it.status === 'lent' ? '已借出' : '可借'
})

/** 联系方式行：楼牌号在前、手机号在后 */
const contactRowsList = computed(() => (item.value ? contactRows(item.value) : []))

/** 图片加载失败（如跨部署通道路径不可达）时降级为占位图 */
const imgBroken = ref(false)
function onImgError(): void {
  imgBroken.value = true
}
watch(() => route.params.id, () => {
  imgBroken.value = false
})

/** 所在位置：物品有定位时反解成「小区 · 区县」短文案（失败静默不展示） */
const addrState = ref<'none' | 'loading' | 'ok'>('none')
const addrLabel = ref('')
watch(item, async (it) => {
  addrState.value = 'none'
  addrLabel.value = ''
  if (!it) return
  const p = itemLatLng(it)
  if (!p) return
  addrState.value = 'loading'
  const label = await reverseGeocode(p)
  if (item.value?.id !== it.id) return // 期间已切到别的物品
  if (!label) {
    addrState.value = 'none'
    return
  }
  addrLabel.value = label
  addrState.value = 'ok'
}, { immediate: true })
</script>

<template>
  <main class="container detail-main">
    <RouterLink to="/" class="back-link">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
        aria-hidden="true">
        <path d="M15 18l-6-6 6-6"></path>
      </svg>
      返回列表
    </RouterLink>

    <!-- 未找到 -->
    <div v-if="!item" class="missing-box">
      <h1 class="detail-title">没有这件物品</h1>
      <p class="detail-desc">它可能已被下架，或链接有误。</p>
      <RouterLink to="/" class="btn-secondary">回首页逛逛</RouterLink>
    </div>

    <article v-else class="detail">
      <span class="detail-tape" aria-hidden="true"></span>

      <div class="photo-side">
        <img v-if="photoUrl && !imgBroken" :src="photoUrl" :alt="item.name" class="detail-photo"
          @error="onImgError" />
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

      <div class="detail-info">
        <p class="meta-mono">
          {{ categoryLabel }} · {{ formatDateShort(item.createTime) }}
          <template v-if="distLabel"> · 距你 {{ distLabel }}</template>
        </p>
        <h1 class="detail-title">{{ item.name }}</h1>
        <p class="detail-desc">{{ item.desc || '（无描述）' }}</p>

        <dl class="detail-rows">
          <div class="detail-row">
            <dt>租金</dt>
            <dd>{{ rentLabel(item) }}</dd>
          </div>
          <div v-for="row in contactRowsList" :key="row.label" class="detail-row">
            <dt>{{ row.label }}</dt>
            <dd class="selectable">{{ row.value }}</dd>
          </div>
          <div v-if="contactRowsList.length === 0" class="detail-row">
            <dt>联系方式</dt>
            <dd>未填写</dd>
          </div>
          <div v-if="addrState !== 'none'" class="detail-row">
            <dt>所在位置</dt>
            <dd>{{ addrState === 'loading' ? '正在解析位置…' : addrLabel }}</dd>
          </div>
          <div v-if="item.archived" class="detail-row">
            <dt>状态</dt>
            <dd>已下架（仅发布者可见）</dd>
          </div>
        </dl>

        <div class="detail-actions">
          <!-- 物主：管理 + 上下架 -->
          <template v-if="ownerIsMe">
            <button type="button" class="btn-primary" @click="manageOpen = true">
              管理此物品
            </button>
            <button type="button" class="btn-secondary" :disabled="store.writing"
              @click="store.setArchived(item.id, !item.archived)">
              {{ item.archived ? '重新上架' : '下架' }}
            </button>
          </template>

          <!-- 借阅人本人：归还 -->
          <button v-else-if="mineLent" type="button" class="btn-primary" :disabled="store.writing"
            @click="store.returnBack(item.id)">
            我要归还
          </button>

          <!-- 其他人：借用（未登录也允许点击，弹窗内提供登录，与首页卡片行为一致） -->
          <button v-else type="button" class="btn-primary"
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

/* ── 返回链接 ── */
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
  margin-bottom: 0.5rem;
}

.back-link svg {
  width: 14px;
  height: 14px;
}

.back-link:hover {
  color: var(--accent);
}

/* ── 未找到 ── */
.missing-box {
  background: var(--surface);
  border: var(--border);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius);
  padding: 3rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}

/* ── 详情容器 ── */
.detail {
  position: relative;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  background: var(--card-bg);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius);
  padding: 1.2rem;
}

@media (min-width: 860px) {
  .detail {
    grid-template-columns: 1.05fr 1fr;
    gap: 2rem;
    padding: 2rem;
  }
}

/* 胶带装饰（默认隐藏，memphis 主题显示） */
.detail-tape {
  display: none;
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

/* ── 图片区 ── */
.photo-side {
  position: relative;
}

.detail-photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius);
  background: var(--photo-bg);
}

.detail-photo.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  color: var(--text-3);
}

.detail-photo.placeholder span {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  border: var(--border-thin);
  background: var(--surface);
  padding: 0.2rem 0.6rem;
  color: var(--ink);
}

.float-badge {
  position: absolute;
  top: 0.8rem;
  left: 0.8rem;
  z-index: 6;
}

/* ── 信息区 ── */
.detail-info {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.meta-mono {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-3);
}

.detail-title {
  font-family: var(--font-head);
  font-size: clamp(1.5rem, 3.5vw, 2.1rem);
  font-weight: 900;
  line-height: 1.25;
  color: var(--ink);
  text-wrap: balance;
}

.detail-desc {
  color: var(--text-2);
  line-height: 1.8;
}

/* ── 信息行 ── */
.detail-rows {
  border: var(--border-thin);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.detail-row {
  display: flex;
  gap: 1rem;
  padding: 0.7rem 0.9rem;
  border-bottom: var(--border-thin);
  font-size: 0.9rem;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row dt {
  flex: none;
  width: 5.5em;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-3);
  padding-top: 0.15rem;
}

.detail-row dd {
  color: var(--ink);
  word-break: break-all;
}

/* ── 操作按钮区 ── */
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 0.3rem;
}

/* 联系方式保持可选中，供长按手动复制 */
.selectable {
  -webkit-user-select: text;
  user-select: text;
}

/* ================================================================
   主题一：memphis
   ================================================================ */
[data-theme="memphis"] .detail {
  transform: rotate(-0.3deg);
}

[data-theme="memphis"] .detail-tape {
  display: block;
}

[data-theme="memphis"] .detail-photo {
  border: var(--border-thin);
  border-color: var(--ink);
  box-shadow: 5px 5px 0 var(--accent-3);
  transform: rotate(0.8deg);
}

[data-theme="memphis"] .float-badge {
  top: -10px;
  left: -8px;
  transform: rotate(-4deg);
}

[data-theme="memphis"] .missing-box {
  transform: rotate(-0.4deg);
  box-shadow: 6px 6px 0 var(--accent-5);
}

/* ================================================================
   主题二：brutalism
   ================================================================ */
[data-theme="brutalism"] .detail-photo {
  border: 1px solid var(--border);
}

/* ================================================================
   主题三：editorial
   ================================================================ */
[data-theme="editorial"] .detail {
  border-radius: 14px;
}

[data-theme="editorial"] .missing-box {
  border-radius: 14px;
}

/* ── 响应式 ── */
@media (max-width: 640px) {
  .detail-actions .btn-primary,
  .detail-actions .btn-secondary {
    flex: 1 1 100%;
  }
}
</style>
