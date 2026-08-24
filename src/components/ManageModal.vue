<script setup lang="ts">
// 物主管理弹窗：站内完成 借出确认/婉拒/归还/下架/重新上架/删除
import BaseModal from './BaseModal.vue'
import type { Item } from '@/lib/types'
import { formatDateShort } from '@/lib/filters'
import { useItemsStore } from '@/stores/items'

const props = defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()

const store = useItemsStore()

const STATUS_TEXT = {
  available: '闲置中',
  requested: '待确认',
  borrowed: '已借出',
} as const

function pending(item: Item) {
  return item.requests.filter((r) => r.status === 'pending')
}

function onConfirmBorrow(id: number, requestId: string): void {
  store.confirmBorrow(id, requestId)
}

function onReject(id: number, requestId: string): void {
  store.rejectRequest(id, requestId)
}

function onReturn(): void {
  if (!props.item) return
  if (window.confirm('确认物品已归还？将恢复为「闲置中」。')) {
    store.confirmReturn(props.item.id)
  }
}

function onToggleArchive(): void {
  if (!props.item) return
  const next = !props.item.archived
  store.setArchived(props.item.id, next)
  emit('close')
}

function onDelete(): void {
  if (!props.item) return
  if (window.confirm(`确定永久删除「${props.item.name}」吗？此操作不可恢复。`)) {
    store.removeItem(props.item.id)
    emit('close')
  }
}
</script>

<template>
  <BaseModal :open="open" labelled-by="manage-title" @close="emit('close')">
    <div v-if="item" class="modal-inner">
      <div class="modal-head">
        <span class="head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z"></path>
            <path d="M9.5 12l1.8 1.8L15 10"></path>
          </svg>
        </span>
        <div>
          <h3 id="manage-title" class="head-title">物品管理</h3>
          <div class="head-sub">{{ item.name }} · 当前：{{ item.archived ? '已下架' : STATUS_TEXT[item.status] }}</div>
        </div>
      </div>

      <!-- 待处理借阅申请 -->
      <section v-if="pending(item).length" class="req-section">
        <h4 class="sec-title">待处理申请</h4>
        <div v-for="r in pending(item)" :key="r.id" class="req-card">
          <div class="req-line">
            <b>{{ r.fromName }}</b>
            <span class="mono">{{ formatDateShort(r.createdAt) }}</span>
          </div>
          <div class="req-contact">{{ r.contact }}</div>
          <p v-if="r.message" class="req-msg">{{ r.message }}</p>
          <div class="req-actions">
            <button type="button" class="btn-memphis-primary btn-sm" @click="onConfirmBorrow(item.id, r.id)">
              同意并标记借出
            </button>
            <button type="button" class="btn-ghost btn-sm" @click="onReject(item.id, r.id)">婉拒</button>
          </div>
        </div>
      </section>
      <p v-else class="empty-tip">暂无待处理的借阅申请。</p>

      <!-- 状态操作 -->
      <section class="ops">
        <button v-if="item.status === 'borrowed'" type="button" class="btn-memphis-primary btn-block"
          @click="onReturn">
          确认归还，恢复可借
        </button>
        <button type="button" class="btn-ghost btn-block" @click="onToggleArchive">
          {{ item.archived ? '重新上架' : '下架（从列表隐藏）' }}
        </button>
        <button type="button" class="btn-danger btn-block" @click="onDelete">
          永久删除
        </button>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.modal-inner {
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.head-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  background: var(--salmon);
  border: 2.5px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.head-title {
  font-family: var(--font-serif);
  font-size: 1.3rem;
}

.head-sub {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #555;
}

.sec-title {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: #555;
  margin-bottom: 0.5rem;
}

.req-section {
  display: flex;
  flex-direction: column;
}

.req-card {
  border: 2px solid var(--ink);
  background: var(--bg-cream);
  box-shadow: 3px 3px 0 var(--ink);
  padding: 0.75rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.req-card + .req-card {
  margin-top: 0.6rem;
}

.req-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: #777;
}

.req-contact {
  font-size: 0.85rem;
  color: #444;
}

.req-msg {
  font-size: 0.88rem;
  line-height: 1.6;
  border-left: 3px solid var(--mustard);
  padding-left: 0.6rem;
}

.req-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.btn-sm {
  padding: 0.45rem 0.8rem;
  font-size: 0.8rem;
  box-shadow: 2px 2px 0 var(--ink);
}

.empty-tip {
  font-size: 0.85rem;
  color: #999;
  text-align: center;
  background: var(--bg-cream);
  border: 1.5px dashed rgba(29, 30, 44, 0.3);
  padding: 0.8rem;
}

.ops {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.btn-block {
  width: 100%;
}
</style>
