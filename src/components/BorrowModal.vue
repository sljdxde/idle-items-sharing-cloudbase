<script setup lang="ts">
// 借阅弹窗：零服务器方案下，展示物主联系方式并引导到 GitHub 沟通
import BaseModal from './BaseModal.vue'
import type { Item } from '@/lib/types'
import { issueUrl } from '@/lib/github'

const props = defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()

function openIssue(): void {
  if (props.item) window.open(issueUrl(props.item.id), '_blank')
}
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
          <h3 id="borrow-title" class="head-title">借用联系</h3>
          <div class="head-sub">「{{ item.name }}」</div>
        </div>
      </div>

      <div class="contact-card">
        <div class="contact-row">
          <span class="k">物主联系方式</span>
          <b class="v selectable">{{ item.contact || '未填写' }}</b>
        </div>
        <div class="contact-row">
          <span class="k">楼号门牌</span>
          <b class="v selectable">{{ item.building || '未填写' }}</b>
        </div>
      </div>

      <p class="privacy-tip">本平台不托管隐私信息，请在 GitHub 上与物主沟通借用细节与时间。</p>

      <button type="button" class="btn-memphis-primary btn-block" @click="openIssue">
        在 GitHub 上与物主沟通
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

.contact-card {
  border: 2px solid var(--ink);
  background: var(--bg-cream);
  box-shadow: 3px 3px 0 var(--ink);
  display: flex;
  flex-direction: column;
}

.contact-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.7rem 0.9rem;
}

.contact-row + .contact-row {
  border-top: 1.5px dashed rgba(29, 30, 44, 0.25);
}

.contact-row .k {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: #777;
}

.contact-row .v {
  font-size: 0.92rem;
  color: var(--ink);
}

/* 容器禁剪贴板 API：联系方式保持可选中，供长按手动复制 */
.selectable {
  -webkit-user-select: text;
  user-select: text;
}

.btn-block {
  width: 100%;
}

.privacy-tip {
  font-size: 0.75rem;
  color: #999;
  text-align: center;
}
</style>
