// ================================================
// src/stores/auth.ts — 手机号 + 管理口令登录（ADR-0005）
// 登录/注册通过 Cloudflare Worker 接口验证，返回 JWT（7天有效）；
// JWT 存 localStorage，写操作时通过 Authorization header 携带。
// 物主/借阅人匹配用 phoneHash（JWT payload 中），不再用明文手机号。
// ================================================

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import { setSessionToken } from '@/lib/session'

const TOKEN_KEY = 'linli_haowu_token_v2'
const PHONE_KEY = 'linli_haowu_phone_v2'

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function readStoredPhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) || ''
  } catch {
    return ''
  }
}

/** 从 JWT payload 中提取 phoneHash（不验证签名，仅用于前端展示匹配） */
function extractPhoneHashFromToken(token: string): string {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return ''
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.phoneHash === 'string' ? payload.phoneHash : ''
  } catch {
    return ''
  }
}

/** 检查 JWT 是否过期（前端预检查，服务端会做最终验证） */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.exp) return true
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(readStoredToken())
  const maskedPhone = ref<string>(readStoredPhone())

  // 内存镜像：隐私模式下 localStorage 写不进，api 层要靠它取 token（见 lib/session.ts）
  setSessionToken(token.value)

  const isLoggedIn = computed(() => !!token.value && !isTokenExpired(token.value))

  /**
   * 当前用户的 phoneHash（从 JWT 提取），用于「我的发布/借用」匹配。
   * 过期的 token 不算身份——否则界面会照常显示「管理/归还」按钮，
   * 点下去必然被服务端 401 拒掉（token 过期但页面没刷新的常见场景）。
   */
  const phoneHash = computed(() =>
    token.value && !isTokenExpired(token.value) ? extractPhoneHashFromToken(token.value) : '',
  )

  async function login(phone: string, pin: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await api.login(phone, pin)
      if (res.ok && res.token) {
        token.value = res.token
        maskedPhone.value = res.phone || maskPhone(phone)
        setSessionToken(res.token)
        try {
          localStorage.setItem(TOKEN_KEY, res.token)
          localStorage.setItem(PHONE_KEY, maskedPhone.value)
        } catch {
          /* 隐私模式：仅内存态 */
        }
        return { ok: true }
      }
      return { ok: false, error: res.error || '登录失败' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '网络异常' }
    }
  }

  async function register(phone: string, pin: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await api.register(phone, pin)
      if (res.ok && res.token) {
        token.value = res.token
        maskedPhone.value = res.phone || maskPhone(phone)
        setSessionToken(res.token)
        try {
          localStorage.setItem(TOKEN_KEY, res.token)
          localStorage.setItem(PHONE_KEY, maskedPhone.value)
        } catch {
          /* 隐私模式 */
        }
        return { ok: true }
      }
      return { ok: false, error: res.error || '注册失败' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '网络异常' }
    }
  }

  function logout(): void {
    token.value = null
    maskedPhone.value = ''
    setSessionToken(null)
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(PHONE_KEY)
    } catch {
      /* ignore */
    }
  }

  return {
    token,
    maskedPhone,
    isLoggedIn,
    phoneHash,
    login,
    register,
    logout,
  }
})

/** 手机号脱敏：138****1234 */
function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}
