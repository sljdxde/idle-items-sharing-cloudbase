<script setup lang="ts">
// ================================================
// LoginBox — 手机号登录卡片（可内联 / 可装进弹窗）
// 无后端模拟登录：手机号即用户标识，localStorage 持久化
// ================================================

import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { isValidPhone } from '@/lib/validate'

const emit = defineEmits<{ loggedIn: [phone: string] }>()

const auth = useAuthStore()
const toast = useToast()

const phone = ref('')
const error = ref('')

function onSubmit(): void {
  const p = phone.value.trim()
  if (!isValidPhone(p)) {
    error.value = '请输入正确的手机号（1 开头 11 位数字）'
    return
  }
  error.value = ''
  auth.login(p)
  toast.success('登录成功', `欢迎回来，${auth.maskedPhone}`)
  emit('loggedIn', p)
  phone.value = ''
}
</script>

<template>
  <form class="login-box" @submit.prevent="onSubmit">
    <p class="login-tip">使用手机号登录后，即可发布闲置、借用邻居的好物</p>
    <label class="login-field">
      <span class="login-label">手机号</span>
      <input
        v-model="phone"
        type="tel"
        inputmode="numeric"
        maxlength="11"
        class="memphis-input"
        placeholder="请输入 11 位手机号"
        autocomplete="tel"
      />
    </label>
    <p v-if="error" class="login-error" role="alert">{{ error }}</p>
    <button type="submit" class="btn-memphis-primary login-submit">登录</button>
  </form>
</template>

<style scoped>
.login-box {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.1rem;
  border: 2.5px dashed var(--ink);
  background: var(--bg-cream);
}

.login-tip {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
  line-height: 1.6;
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.login-label {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
}

.login-error {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--retro-red);
}

.login-submit {
  width: 100%;
}
</style>
