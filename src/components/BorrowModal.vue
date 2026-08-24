<script setup lang="ts">
// 借阅弹窗：展示联系方式/楼号 + GitHub 沟通入口
import BaseModal from './BaseModal.vue'
import type { Item } from '@/lib/types'
import { issueUrl } from '@/lib/api'

defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <BaseModal :open="open" labelled-by="borrow-title" @close="emit('close')">
    <div v-if="item" class="modal-inner">
      <div class="modal-head">
        <span class="head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M4 11 12 4l8 7"></path>
            <path d="M6 10v9h12v-9"></path>
          </svg>
        </span>
        <div>
          <h3 id="borrow-title" class="head-title">联系物主</h3>
          <div class="head-sub">直接联系取物，或在 GitHub 沟通</div>
        </div>
      </div>

      <p class="contact-tip">和邻居打个招呼吧——说明想借的时间与用途，更容易借到。</p>

      <dl class="detail-rows">
        <div v-if="item.contact" class="detail-row">
          <dt>联系方式</dt>
          <dd>{{ item.contact }}</dd>
        </div>
        <div v-if="item.building" class="detail-row">
          <dt>楼号</dt>
          <dd>{{ item.building }}</dd>
        </div>
        <div class="detail-row">
          <dt>物品状态</dt>
          <dd>{{ item.status === 'available' ? '闲置中' : item.status === 'requested' ? '待确认' : '已借出' }}</dd>
        </div>
      </dl>

      <a class="btn-memphis-primary btn-block" :href="issueUrl(item.id)" target="_blank" rel="noopener noreferrer">
        在 GitHub 查看 / 沟通
      </a>
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
  background: var(--mustard);
  border: 2.5px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.head-title {
  font-family: var(--font-serif);
  font-size: 1.3rem;
}

.head-sub {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: #777;
}

.contact-tip {
  background: var(--bg-cream);
  border: 1.5px dashed var(--ink);
  padding: 0.7rem 0.9rem;
  font-size: 0.88rem;
  line-height: 1.65;
}

.detail-rows {
  display: flex;
  flex-direction: column;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0.2rem;
  border-bottom: 1.5px dashed rgba(29, 30, 44, 0.25);
  font-size: 0.92rem;
}

.detail-row dt {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: #777;
  white-space: nowrap;
}

.detail-row dd {
  text-align: right;
  overflow-wrap: anywhere;
}

.btn-block {
  width: 100%;
}
</style>
