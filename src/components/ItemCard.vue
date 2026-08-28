<script setup lang="ts">
// ================================================
// ItemCard — 孟菲斯拼贴卡片：胶带 + 网点占位图 + 错位旋转 + 撞色硬阴影
// 按登录手机号区分角色：物主（管理/上下架）· 借阅人（归还）· 其他人（我想借）
// ================================================

import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { Item } from '@/lib/types'
import { formatDateShort } from '@/lib/filters'
import { isOwner, canReturn } from '@/lib/itemOps'
import { cardPlaceText } from '@/lib/contact'
import { useAuthStore } from '@/stores/auth'
import { useItemsStore } from '@/stores/items'

const props = defineProps<{
  item: Item
  /** 卡片在网格中的序号：决定错位旋转角与撞色阴影 */
  index?: number
}>()

defineEmits<{
  borrow: [item: Item]
  manage: [item: Item]
}>()

const auth = useAuthStore()
const store = useItemsStore()

const ownerIsMe = computed(() => isOwner(props.item, auth.phone))
const canReturnMine = computed(() => canReturn(props.item, auth.phone))

/** 状态徽标：可借 / 已借出 / 已下架 */
const statusText = computed(() => {
  if (props.item.archived) return '已下架'
  return props.item.status === 'lent' ? '已借出' : '可借'
})
const statusClass = computed(() =>
  props.item.archived
    ? 'pending'
    : props.item.status === 'lent'
      ? 'borrowed'
      : 'available',
)

/** 距离标签（用户已定位且物品有定位时显示） */
const distLabel = computed(() => store.distanceLabel(props.item))

/** 位置文案：楼号优先展示；手机号联系方式显示脱敏号（楼在前、号在后） */
const placeText = computed(() => cardPlaceText(props.item))

/** 第 n 张卡片的旋转角与撞色阴影（循环复用 6 组，与样机一致） */
const VARIANTS = [
  { shadow: 'var(--retro-red)', rotate: '-0.5deg' },
  { shadow: 'var(--royal-blue)', rotate: '0.8deg' },
  { shadow: 'var(--mustard)', rotate: '-0.6deg' },
  { shadow: 'var(--olive)', rotate: '0.5deg' },
  { shadow: 'var(--retro-purple)', rotate: '-0.7deg' },
  { shadow: 'var(--salmon)', rotate: '0.6deg' },
] as const

const cardStyle = computed(() => {
  const v = VARIANTS[(props.index ?? 0) % VARIANTS.length]
  return {
    transform: `rotate(${v.rotate})`,
    boxShadow: `6px 6px 0 ${v.shadow}`,
  }
})

function onToggleArchive(): void {
  store.setArchived(props.item.id, !props.item.archived)
}
</script>

<template>
  <article class="memphis-card" :style="cardStyle">
    <div class="memphis-card-tape" aria-hidden="true"></div>

    <RouterLink :to="`/items/${item.id}`" class="card-photo" :aria-label="`查看 ${item.name} 详情`">
      <img v-if="item.imgUrl" class="card-photo-img" :src="item.imgUrl" :alt="item.name" loading="lazy" />
      <template v-else>
        <div class="card-photo-dots" aria-hidden="true"></div>
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>小主没有上传图片哦</span>
      </template>
      <span v-if="item.imgUrl" class="photo-veil" aria-hidden="true"></span>
    </RouterLink>

    <div class="card-inner">
      <div class="card-meta-header">
        <span class="badge-status" :class="statusClass">{{ statusText }}</span>
        <span v-if="distLabel" class="dist-label" aria-label="距离">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          {{ distLabel }}
        </span>
      </div>

      <h2 class="card-heading">
        <RouterLink :to="`/items/${item.id}`">{{ item.name }}</RouterLink>
      </h2>
      <p class="card-paragraph">{{ item.desc || '（无描述）' }}</p>

      <div class="card-info-strip">
        <span>{{ placeText }}</span>
        <span>{{ formatDateShort(item.createTime) }}</span>
      </div>
    </div>

    <div class="card-btn-box">
      <!-- 物主：管理 + 快捷上下架 -->
      <template v-if="ownerIsMe">
        <button type="button" class="btn-item-borrow" @click="$emit('manage', item)">管理</button>
        <button type="button" class="btn-item-manage" :disabled="store.writing" @click="onToggleArchive">
          {{ item.archived ? '上架' : '下架' }}
        </button>
      </template>
      <!-- 借阅人本人：归还 -->
      <button v-else-if="canReturnMine" type="button" class="btn-item-borrow btn-return"
        :disabled="store.writing" @click="store.returnBack(item.id)">
        我要归还
      </button>
      <!-- 其他人：借用 -->
      <button v-else type="button" class="btn-item-borrow"
        :disabled="item.status === 'lent' || item.archived || store.writing" @click="$emit('borrow', item)">
        {{ item.status === 'lent' ? '已借出' : item.archived ? '已下架' : '我想借' }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.memphis-card {
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  display: flex;
  flex-direction: column;
  position: relative;
  transition:
    transform 0.25s var(--ease),
    box-shadow 0.25s var(--ease);
}

.memphis-card:hover {
  transform: translate(-4px, -4px) rotate(0deg) scale(1.02) !important;
  box-shadow: 10px 10px 0 var(--ink) !important;
  z-index: 15;
}

.memphis-card-tape {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 70px;
  height: 20px;
  background: rgba(233, 196, 106, 0.7);
  border: 1px solid var(--ink);
  z-index: 5;
}

.card-photo {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 180px;
  background: #f1ece1;
  border-bottom: 2.5px solid var(--ink);
  overflow: hidden;
}

.card-photo-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-veil {
  position: absolute;
  inset: auto 0 0 0;
  height: 34px;
  background: linear-gradient(transparent, rgba(29, 30, 44, 0.35));
}

.card-photo > svg {
  width: 34px;
  height: 34px;
  stroke: var(--ink);
  position: relative;
  z-index: 1;
}

.card-photo > span {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--paper-cream);
  border: 1.5px solid var(--ink);
  padding: 0.2rem 0.6rem;
  box-shadow: 2px 2px 0 var(--ink);
  position: relative;
  z-index: 1;
}

.card-inner {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.card-meta-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dist-label {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--royal-blue);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.card-heading {
  font-family: var(--font-serif);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.25;
  text-wrap: balance;
}

.card-heading a {
  color: inherit;
}

.card-heading a:hover {
  text-decoration: underline;
  text-decoration-color: var(--mustard);
  text-decoration-thickness: 3px;
  text-underline-offset: 4px;
}

.card-paragraph {
  font-size: 0.92rem;
  line-height: 1.6;
  color: #333;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-info-strip {
  border-top: 1.5px dashed var(--ink);
  padding-top: 0.65rem;
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: #555;
}

.card-btn-box {
  display: grid;
  grid-template-columns: 1fr auto;
  border-top: 2.5px solid var(--ink);
}

.btn-item-borrow,
.btn-item-manage {
  min-height: 48px;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  font-weight: 700;
  border: none;
  transition: background var(--ease-snap);
}

.btn-item-borrow {
  background: var(--retro-purple);
  color: #fff;
  border-right: 2px solid var(--ink);
}

.btn-item-borrow:hover:not(:disabled) {
  background: var(--retro-red);
}

.btn-item-borrow:disabled {
  background: #d9d9d9;
  color: #888;
  cursor: not-allowed;
}

.btn-return {
  background: var(--royal-blue);
}

.btn-return:hover:not(:disabled) {
  background: var(--ink);
}

.btn-item-manage {
  padding: 0 1.2rem;
  font-size: 0.88rem;
  background: var(--paper-cream);
  color: var(--ink);
}

.btn-item-manage:hover {
  background: var(--mustard);
}

.btn-item-manage:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
