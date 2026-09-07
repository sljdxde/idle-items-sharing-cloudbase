<script setup lang="ts">
// 登录弹窗：Navbar 全局入口
import BaseModal from './BaseModal.vue'
import LoginBox from './LoginBox.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <BaseModal :open="open" labelled-by="login-title" @close="emit('close')">
    <div class="modal-inner">
      <div class="modal-head">
        <span class="head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </span>
        <h3 id="login-title" class="head-title">手机号登录</h3>
        <button class="close-btn" aria-label="关闭" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <LoginBox @logged-in="emit('close')" />
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
  background: var(--accent);
  color: var(--accent-ink);
  border: var(--border-thin);
}

.head-title {
  font-family: var(--font-head);
  font-size: 1.3rem;
  color: var(--ink);
  flex: 1;
}

.close-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: var(--border-thin);
  color: var(--ink);
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.close-btn:hover {
  background: var(--accent-2);
  color: var(--accent-ink);
  box-shadow: 2px 2px 0 var(--ink);
  transform: translate(-1px, -1px);
}
.close-btn:active {
  transform: translate(1px, 1px);
  box-shadow: none;
}
</style>
