<script setup lang="ts">
// 借阅弹窗：站内发起借用申请（本地数据，无需任何外部账号）
import { reactive, watch } from 'vue'
import BaseModal from './BaseModal.vue'
import type { Item } from '@/lib/types'
import { useItemsStore } from '@/stores/items'

const props = defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()

const store = useItemsStore()

const form = reactive({ fromName: '', contact: '', message: '' })

watch(
  () => props.open,
  (open) => {
    if (open) {
      form.fromName = ''
      form.contact = ''
      form.message = ''
    }
  },
)

function submit(): void {
  if (!props.item) return
  if (!form.fromName.trim() || !form.contact.trim()) return
  store.requestBorrow(props.item.id, {
    fromName: form.fromName,
    contact: form.contact,
    message: form.message,
  })
  emit('close')
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
          <h3 id="borrow-title" class="head-title">申请借用</h3>
          <div class="head-sub">「{{ item.name }}」</div>
        </div>
      </div>

      <form class="borrow-form" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">你的称呼 *</span>
          <input v-model="form.fromName" class="input" type="text" required maxlength="20"
            placeholder="如：3栋小王">
        </label>
        <label class="field">
          <span class="field-label">联系方式 *</span>
          <input v-model="form.contact" class="input" type="text" required maxlength="40"
            placeholder="微信 / 手机号">
        </label>
        <label class="field">
          <span class="field-label">想借多久、做什么用</span>
          <textarea v-model="form.message" class="input textarea" rows="3" maxlength="120"
            placeholder="说明用途与归还时间，更容易借到"></textarea>
        </label>
        <button type="submit" class="btn-memphis-primary btn-block">提交申请，等物主确认</button>
        <p class="privacy-tip">申请会连同称呼与联系方式一起展示给物主。</p>
      </form>
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

.borrow-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: #555;
}

.textarea {
  resize: none;
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
