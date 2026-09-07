<script setup lang="ts">
// ================================================
// ItemCard — 孟菲斯拼贴卡片：胶带 + 网点占位图 + 错位旋转 + 撞色硬阴影
// 按登录手机号区分角色：物主（管理/上下架）· 借阅人（归还）· 其他人（我想借）
// ================================================

import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Item } from '@/lib/types'
import { formatDateShort } from '@/lib/filters'
import { cardPlaceText } from '@/lib/contact'
import { useItemsStore } from '@/stores/items'
import { safeImgUrl } from '@/lib/safeImage'
import { rentLabel } from '@/lib/rent'

const props = defineProps<{
  item: Item
  /** 卡片在网格中的序号：决定错位旋转角与撞色阴影 */
  index?: number
}>()

defineEmits<{
  borrow: [item: Item]
  manage: [item: Item]
}>()

const store = useItemsStore()

/** 图片加载失败（如跨部署通道路径不可达）时降级为占位图 */
const imgBroken = ref(false)
function onImgError(): void {
  imgBroken.value = true
}

const ownerIsMe = computed(() => store.owns(props.item))
const canReturnMine = computed(() => store.holds(props.item))
const photoUrl = computed(() => safeImgUrl(props.item.imgUrl))

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
  { shadow: 'var(--accent-2)', rotate: '-0.5deg' },
  { shadow: 'var(--accent-4)', rotate: '0.8deg' },
  { shadow: 'var(--accent-3)', rotate: '-0.6deg' },
  { shadow: 'var(--accent-6)', rotate: '0.5deg' },
  { shadow: 'var(--accent)', rotate: '-0.7deg' },
  { shadow: 'var(--accent-5)', rotate: '0.6deg' },
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
      <img v-if="photoUrl && !imgBroken" class="card-photo-img" :src="photoUrl" :alt="item.name" loading="lazy"
        @error="onImgError" />
      <template v-else>
        <div class="card-photo-dots" aria-hidden="true"></div>
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>小主没有上传图片哦</span>
      </template>
      <span v-if="photoUrl && !imgBroken" class="photo-veil" aria-hidden="true"></span>
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
        <span v-if="item.rentType !== 'free'" class="rent-tag">{{ rentLabel(item) }}</span>
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
/* ── 默认（memphis）卡片样式 ── */
.memphis-card {
  background: var(--card-bg);
  border: var(--card-border);
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
  background: color-mix(in srgb, var(--accent-3) 70%, transparent);
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
  background: var(--photo-bg);
  border-bottom: var(--border-thin);
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
  background: linear-gradient(transparent, color-mix(in srgb, var(--ink) 35%, transparent));
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
  background: var(--surface);
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
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.card-heading {
  font-family: var(--font-head);
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
  text-decoration-color: var(--accent-3);
  text-decoration-thickness: 3px;
  text-underline-offset: 4px;
}

.card-paragraph {
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--text-2);
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-info-strip {
  border-top: 1px dashed var(--text-3);
  padding-top: 0.65rem;
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-2);
}

.rent-tag {
  color: var(--accent);
  font-weight: 700;
}

.card-btn-box {
  display: grid;
  grid-template-columns: 1fr auto;
  border-top: var(--border-thin);
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
  background: var(--accent);
  color: var(--accent-ink);
  border-right: var(--border-thin);
}

.btn-item-borrow:hover:not(:disabled) {
  background: var(--accent-2);
}

.btn-item-borrow:disabled {
  background: var(--surface-3);
  color: var(--text-3);
  cursor: not-allowed;
}

.btn-return {
  background: var(--accent-4);
}

.btn-return:hover:not(:disabled) {
  background: var(--ink);
}

.btn-item-manage {
  padding: 0 1.2rem;
  font-size: 0.88rem;
  background: var(--surface);
  color: var(--ink);
}

.btn-item-manage:hover:not(:disabled) {
  background: var(--accent-3);
}

.btn-item-manage:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── brutalism 主题：桌面端表格形态（≥900px，7 列网格） ── */
@media (min-width: 900px) {
  [data-theme="brutalism"] .memphis-card {
    display: grid;
    grid-template-columns: 100px 2.5fr 1.5fr 90px 90px 90px 170px;
    grid-template-rows: auto auto;
    gap: 2px 14px;
    align-items: center;
    padding: 12px 16px;
    border: none;
    border-bottom: var(--border);
    border-radius: 0;
    background: #fff;
    box-shadow: none !important;
    transform: none !important;
    overflow: visible;
  }

  [data-theme="brutalism"] .memphis-card:last-child {
    border-bottom: none;
  }

  [data-theme="brutalism"] .memphis-card:hover {
    background: var(--surface-2);
    box-shadow: none !important;
    transform: none !important;
  }

  [data-theme="brutalism"] .memphis-card-tape {
    display: none;
  }

  [data-theme="brutalism"] .card-photo {
    grid-column: 1;
    grid-row: 1 / 3;
    min-height: 68px;
    height: 68px;
    background: var(--photo-bg);
    border: var(--border);
  }

  [data-theme="brutalism"] .card-photo > svg {
    width: 22px;
    height: 22px;
    stroke: var(--text-3);
  }

  [data-theme="brutalism"] .card-photo > span,
  [data-theme="brutalism"] .card-photo-dots {
    display: none;
  }

  [data-theme="brutalism"] .card-inner {
    display: contents;
  }

  [data-theme="brutalism"] .card-meta-header {
    display: contents;
  }

  [data-theme="brutalism"] .badge-status {
    grid-column: 4;
    grid-row: 1 / 3;
    justify-self: start;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 6px;
  }

  [data-theme="brutalism"] .dist-label {
    grid-column: 5;
    grid-row: 1 / 3;
    justify-self: start;
    font-size: 13px;
    color: var(--text-2);
  }

  [data-theme="brutalism"] .card-heading {
    grid-column: 2;
    grid-row: 1;
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  [data-theme="brutalism"] .card-paragraph {
    grid-column: 2;
    grid-row: 2;
    font-size: 13px;
    -webkit-line-clamp: 1;
    flex: none;
    padding: 0;
  }

  [data-theme="brutalism"] .card-info-strip {
    display: contents;
    border: none;
    padding: 0;
  }

  [data-theme="brutalism"] .card-info-strip > span:first-child {
    display: none;
  }

  [data-theme="brutalism"] .rent-tag {
    grid-column: 3;
    grid-row: 1 / 3;
    color: var(--text-2);
    font-weight: 600;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  [data-theme="brutalism"] .card-info-strip > span:last-child {
    grid-column: 6;
    grid-row: 1 / 3;
    justify-self: start;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-2);
  }

  [data-theme="brutalism"] .card-btn-box {
    grid-column: 7;
    grid-row: 1 / 3;
    margin-top: 0;
    border: none;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  [data-theme="brutalism"] .btn-item-borrow,
  [data-theme="brutalism"] .btn-item-manage {
    min-height: 38px;
    padding: 0 12px;
    border: 1px solid var(--ink);
    background: #fff;
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    border-radius: 0;
  }

  [data-theme="brutalism"] .btn-item-borrow {
    border-right: 1px solid var(--ink);
  }

  [data-theme="brutalism"] .btn-item-borrow:hover:not(:disabled),
  [data-theme="brutalism"] .btn-item-manage:hover:not(:disabled) {
    background: var(--surface-2);
  }

  [data-theme="brutalism"] .btn-item-borrow:disabled {
    background: #fff;
    color: var(--text-3);
    border-color: var(--border);
  }

  [data-theme="brutalism"] .btn-return {
    background: var(--ink);
    color: #fff;
  }
}

/* ── brutalism 主题：移动端列表形态（<900px，3 列网格） ── */
@media (max-width: 899px) {
  [data-theme="brutalism"] .memphis-card {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    gap: 4px 12px;
    padding: 10px 12px;
    border: none;
    border-bottom: var(--border);
    border-radius: 0;
    background: #fff;
    box-shadow: none !important;
    transform: none !important;
    overflow: visible;
  }

  [data-theme="brutalism"] .memphis-card:last-child {
    border-bottom: none;
  }

  [data-theme="brutalism"] .memphis-card:hover {
    background: var(--surface-2);
    box-shadow: none !important;
    transform: none !important;
  }

  [data-theme="brutalism"] .memphis-card-tape {
    display: none;
  }

  [data-theme="brutalism"] .card-photo {
    grid-column: 1;
    grid-row: 1 / 3;
    min-height: 64px;
    height: 64px;
    background: var(--photo-bg);
    border: var(--border);
  }

  [data-theme="brutalism"] .card-photo > svg {
    width: 20px;
    height: 20px;
    stroke: var(--text-3);
  }

  [data-theme="brutalism"] .card-photo > span,
  [data-theme="brutalism"] .card-photo-dots {
    display: none;
  }

  [data-theme="brutalism"] .card-inner {
    grid-column: 2;
    grid-row: 1 / 3;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 0;
    align-self: center;
    flex: none;
  }

  [data-theme="brutalism"] .card-meta-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
  }

  [data-theme="brutalism"] .card-heading {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  [data-theme="brutalism"] .card-paragraph {
    display: none;
  }

  [data-theme="brutalism"] .badge-status {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
  }

  [data-theme="brutalism"] .dist-label {
    display: inline-flex;
    font-size: 12px;
    color: var(--text-2);
  }

  [data-theme="brutalism"] .card-info-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 0;
    padding: 0;
    border: none;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-2);
  }

  [data-theme="brutalism"] .card-info-strip > span:first-child {
    display: none;
  }

  [data-theme="brutalism"] .rent-tag {
    color: var(--ink);
    font-weight: 700;
    font-size: 13px;
  }

  [data-theme="brutalism"] .card-info-strip > span:last-child {
    color: var(--text-3);
  }

  [data-theme="brutalism"] .card-btn-box {
    grid-column: 3;
    grid-row: 1 / 3;
    margin: 0;
    border: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    align-items: stretch;
  }

  [data-theme="brutalism"] .btn-item-borrow,
  [data-theme="brutalism"] .btn-item-manage {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--ink);
    background: #fff;
    color: var(--ink);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    border-radius: 0;
  }

  [data-theme="brutalism"] .btn-item-borrow:disabled {
    background: #fff;
    color: var(--text-3);
    border-color: var(--border);
  }

  [data-theme="brutalism"] .btn-return {
    background: var(--ink);
    color: #fff;
  }
}

/* ── editorial 主题覆盖 ── */
[data-theme="editorial"] .memphis-card {
  border-radius: 12px;
}

[data-theme="editorial"] .memphis-card:hover {
  transform: translateY(-4px) !important;
  border-color: var(--accent-4);
}

[data-theme="editorial"] .card-photo {
  height: 180px;
  min-height: 180px;
  background: var(--photo-bg);
  border-bottom: var(--border);
}

[data-theme="editorial"] .card-heading {
  font-family: var(--font-head);
}

[data-theme="editorial"] .rent-tag {
  color: var(--accent-2);
}

[data-theme="editorial"] .dist-label {
  color: var(--accent-2);
}

[data-theme="editorial"] .btn-item-borrow {
  border-radius: 8px;
  border: none;
}
</style>
