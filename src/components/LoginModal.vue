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
  background: var(--royal-blue);
  color: #fff;
  border: 2.5px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.head-title {
  font-family: var(--font-serif);
  font-size: 1.3rem;
}
</style>
