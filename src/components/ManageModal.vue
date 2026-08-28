<script setup lang="ts">
// 物主管理弹窗：零服务器方案下，引导到 GitHub 对 Issue 操作（标签 / 关闭）
import BaseModal from './BaseModal.vue'
import type { Item } from '@/lib/types'
import { issueUrl } from '@/lib/github'

const props = defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()

const STATUS_TEXT = {
  available: '闲置中',
  requested: '待确认',
  borrowed: '已借出',
} as const

function openIssue(): void {
  if (props.item) window.open(issueUrl(props.item.id), '_blank')
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

      <p class="guide-title">在 GitHub 上管理此物品：</p>
      <ul class="guide-list">
        <li>添加 <code>lent</code> 标签 → 标记为「已借出」</li>
        <li>移除 <code>lent</code> 标签 → 标记「已归还」</li>
        <li>关闭 Issue → 下架（从列表隐藏）</li>
        <li>重新打开 Issue → 重新上架</li>
      </ul>

      <button type="button" class="btn-memphis-primary btn-block" @click="openIssue">
        在 GitHub 打开此物品
      </button>
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

.guide-title {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: #555;
}

.guide-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.guide-list li {
  font-size: 0.88rem;
  line-height: 1.6;
  color: #333;
  border-left: 3px solid var(--mustard);
  padding-left: 0.6rem;
}

.guide-list code {
  font-family: var(--font-mono);
  font-weight: 700;
  background: var(--bg-cream);
  border: 1.5px solid var(--ink);
  padding: 0 0.3em;
}

.btn-block {
  width: 100%;
}
</style>
