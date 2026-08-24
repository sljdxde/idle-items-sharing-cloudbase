<script setup lang="ts">
// 物主管理弹窗：GitHub 标签操作指引（方案1 写路径）
import BaseModal from './BaseModal.vue'
import type { Item } from '@/lib/types'
import { issueUrl } from '@/lib/api'

defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()

const STATUS_TEXT = {
  available: '闲置中',
  requested: '待确认',
  borrowed: '已借出',
} as const
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
          <div class="head-sub">当前状态：{{ STATUS_TEXT[item.status] }}</div>
        </div>
      </div>

      <ol class="guide-list">
        <li><b>借出</b>：在 GitHub 给该 Issue 添加 <code>lent</code> 标签</li>
        <li><b>归还</b>：移除 <code>lent</code> 标签（恢复为闲置中，可再次被借）</li>
        <li><b>下架</b>：关闭该 Issue 即从列表移除</li>
      </ol>

      <a class="btn-memphis-primary btn-block" :href="issueUrl(item.id)" target="_blank" rel="noopener noreferrer">
        在 GitHub 管理此物品
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

.guide-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  counter-reset: step;
}

.guide-list li {
  position: relative;
  padding-left: 2.1rem;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.92rem;
  line-height: 1.55;
  border-bottom: 1.5px dashed rgba(29, 30, 44, 0.25);
  padding-bottom: 0.55rem;
}

.guide-list li::before {
  counter-increment: step;
  content: counter(step);
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--mustard);
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
}

.guide-list code {
  font-family: var(--font-mono);
  font-size: 0.82em;
  background: var(--bg-cream);
  border: 1px solid var(--ink);
  padding: 0.05em 0.4em;
}

.btn-block {
  width: 100%;
}
</style>
