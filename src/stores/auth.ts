// ================================================
// src/stores/auth.ts — 手机号登录（本地模拟）
// 无后端：以手机号作为用户唯一标识，localStorage 持久化登录态；
// 发布者与借阅者依据登录手机号区分。
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isValidPhone } from '@/lib/validate'

const USER_KEY = 'linli_haowu_user_v1'

function readStoredPhone(): string | null {
  try {
    const v = localStorage.getItem(USER_KEY)
    return v && isValidPhone(v) ? v : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const phone = ref<string | null>(readStoredPhone())

  const isLoggedIn = computed(() => !!phone.value)

  /** 138****1234 式脱敏展示 */
  const maskedPhone = computed(() =>
    phone.value ? phone.value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '',
  )

  function login(raw: string): boolean {
    const p = raw.trim()
    if (!isValidPhone(p)) return false
    phone.value = p
    try {
      localStorage.setItem(USER_KEY, p)
    } catch {
      /* 隐私模式：仅内存态 */
    }
    return true
  }

  function logout(): void {
    phone.value = null
    try {
      localStorage.removeItem(USER_KEY)
    } catch {
      /* ignore */
    }
  }

  return { phone, isLoggedIn, maskedPhone, login, logout }
})
