<script setup lang="ts">
// ================================================
// AdminResetPage — 管理员专用：重置用户管理口令
// 安全设计：令牌不硬编码，由管理员手动输入，存 sessionStorage（关闭标签页失效）
// ================================================

import { ref, onMounted } from 'vue'
import { useToast } from '@/composables/useToast'
import { isValidPhone } from '@/lib/validate'

const toast = useToast()

const TOKEN_KEY = 'linli_admin_token'

// 管理员令牌
const adminToken = ref('')
const tokenInput = ref('')
const tokenError = ref('')

// 重置表单
const phone = ref('')
const pin = ref<string[]>(['', '', '', '', '', ''])
const phoneError = ref('')
const pinError = ref('')
const submitting = ref(false)
const resultMsg = ref('')

onMounted(() => {
  // 从 sessionStorage 读取令牌（关闭标签页即失效）
  const saved = sessionStorage.getItem(TOKEN_KEY)
  if (saved) adminToken.value = saved
})

// 验证令牌（只是本地格式检查，真正的校验在后端）
function saveToken(): void {
  tokenError.value = ''
  const t = tokenInput.value.trim()
  if (!t) {
    tokenError.value = '请输入管理员令牌'
    return
  }
  adminToken.value = t
  sessionStorage.setItem(TOKEN_KEY, t)
  tokenInput.value = ''
  toast.success('已验证身份', '管理员令牌已保存，关闭标签页后失效')
}

function logout(): void {
  adminToken.value = ''
  sessionStorage.removeItem(TOKEN_KEY)
  resultMsg.value = ''
}

// PIN 输入框联动
function onPinInput(index: number, event: Event): void {
  const input = event.target as HTMLInputElement
  const val = input.value.replace(/\D/g, '')
  pin.value[index] = val
  input.value = val
  if (val && index < 5) {
    const next = input.parentElement?.children[index + 1] as HTMLInputElement
    next?.focus()
  }
}

function onPinKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === 'Backspace' && !pin.value[index] && index > 0) {
    const prev = (event.target as HTMLInputElement).parentElement?.children[index - 1] as HTMLInputElement
    pin.value[index - 1] = ''
    if (prev) {
      prev.value = ''
      prev.focus()
    }
  }
}

function onPinPaste(event: ClipboardEvent): void {
  event.preventDefault()
  const text = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6)
  const container = (event.target as HTMLInputElement).parentElement
  if (!container) return
  text.split('').forEach((ch, i) => {
    pin.value[i] = ch
    const input = container.children[i] as HTMLInputElement
    if (input) input.value = ch
  })
  if (text.length < 6) {
    const next = container.children[text.length] as HTMLInputElement
    next?.focus()
  }
}

function pinToString(): string {
  return pin.value.join('')
}

function clearPin(): void {
  for (let i = 0; i < 6; i++) pin.value[i] = ''
  setTimeout(() => {
    document.querySelectorAll<HTMLInputElement>('.admin-pin-box').forEach((el) => {
      el.value = ''
    })
  }, 0)
}

async function handleReset(): Promise<void> {
  phoneError.value = ''
  pinError.value = ''
  resultMsg.value = ''

  const p = phone.value.trim()
  const newPin = pinToString()

  if (!p) {
    phoneError.value = '请输入手机号'
    return
  }
  if (!isValidPhone(p)) {
    phoneError.value = '手机号格式不正确'
    return
  }
  if (newPin.length < 6) {
    pinError.value = '请输入完整的 6 位新口令'
    return
  }

  submitting.value = true
  try {
    const res = await fetch('/api/admin/reset-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-site-key': 'neighborhood-share-2026',
        'x-admin-token': adminToken.value,
      },
      body: JSON.stringify({ phone: p, newPin }),
    })
    const data = await res.json()
    if (res.ok && data.ok) {
      resultMsg.value = `重置成功！用户 ${data.phone} 的新口令为：${data.temporaryPin}`
      toast.success('重置成功', `新口令：${data.temporaryPin}`)
      clearPin()
      phone.value = ''
    } else {
      const err = data.error || '重置失败'
      resultMsg.value = `重置失败：${err}`
      if (res.status === 403 || res.status === 404) {
        // 令牌错误或接口不存在，清除本地令牌
        adminToken.value = ''
        sessionStorage.removeItem(TOKEN_KEY)
        toast.error('令牌无效', '请重新输入管理员令牌')
      } else {
        toast.error('重置失败', err)
      }
    }
  } catch {
    resultMsg.value = '网络错误，请稍后重试'
    toast.error('网络错误', '请检查网络连接')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="container admin-page">
    <div class="admin-card">
      <!-- 头部 -->
      <div class="admin-head">
        <span class="admin-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </span>
        <h1 class="admin-title">管理员 · 重置管理口令</h1>
      </div>

      <!-- 未输入令牌：令牌输入 -->
      <div v-if="!adminToken" class="admin-body">
        <p class="admin-desc">
          请输入管理员令牌以验证身份。令牌仅保存在当前浏览器标签页，关闭后立即失效。
        </p>
        <label class="admin-field">
          <span class="admin-label">管理员令牌</span>
          <input
            v-model="tokenInput"
            type="password"
            class="input admin-token-input"
            placeholder="请输入管理员令牌"
            @keyup.enter="saveToken"
          />
        </label>
        <p v-if="tokenError" class="admin-error">{{ tokenError }}</p>
        <button class="btn-primary admin-submit" @click="saveToken">
          验证身份
        </button>
      </div>

      <!-- 已验证：重置表单 -->
      <div v-else class="admin-body">
        <div class="admin-logged-bar">
          <span class="admin-logged-text">已验证管理员身份</span>
          <button class="admin-logout-btn" @click="logout">退出</button>
        </div>

        <label class="admin-field">
          <span class="admin-label">用户手机号</span>
          <input
            v-model="phone"
            type="tel"
            inputmode="numeric"
            maxlength="11"
            class="input"
            :class="{ 'admin-input-error': phoneError }"
            placeholder="请输入 11 位手机号"
            @input="phoneError = ''"
          />
        </label>

        <div class="admin-field">
          <span class="admin-label">新管理口令（6 位数字）</span>
          <div class="admin-pin-inputs">
            <input
              v-for="(_, i) in 6"
              :key="i"
              class="admin-pin-box"
              type="password"
              maxlength="1"
              inputmode="numeric"
              :value="pin[i]"
              @input="onPinInput(i, $event)"
              @keydown="onPinKeydown(i, $event)"
              @paste="onPinPaste"
            />
          </div>
          <p class="admin-hint">设置后用户需用此新口令登录，旧口令立即失效</p>
        </div>

        <p v-if="pinError" class="admin-error">{{ pinError }}</p>

        <button
          class="btn-primary admin-submit"
          :disabled="submitting"
          @click="handleReset"
        >
          {{ submitting ? '重置中…' : '确认重置' }}
        </button>

        <!-- 结果 -->
        <div v-if="resultMsg" class="admin-result" :class="{ success: resultMsg.includes('成功') }">
          {{ resultMsg }}
        </div>
      </div>
    </div>

    <p class="admin-footer-note">
      此页面仅限管理员使用，请勿分享给他人。所有重置操作均有后端鉴权。
    </p>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 480px;
  margin: 2rem auto;
}

/* ── 卡片 ── */
.admin-card {
  background: var(--surface);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius);
  overflow: hidden;
}

.admin-head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 1.1rem 1.2rem;
  border-bottom: var(--border-thin);
  background: var(--surface-2);
}

.admin-icon {
  display: inline-flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  background: var(--accent-2);
  color: var(--accent-ink);
  border: var(--border-thin);
  box-shadow: var(--shadow-soft);
  flex-shrink: 0;
  border-radius: var(--radius-sm);
}

.admin-title {
  font-family: var(--font-head);
  font-size: 1.15rem;
  color: var(--ink);
  margin: 0;
  line-height: 1.3;
}

.admin-body {
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

/* ── 描述 ── */
.admin-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-2);
  line-height: 1.6;
  padding: 0.5rem 0.7rem;
  background: var(--surface-2);
  border-left: 3px solid var(--accent-2);
  border-radius: var(--radius-sm);
}

/* ── 字段 ── */
.admin-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.admin-label {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink);
}

.admin-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-3);
  font-family: var(--font-mono);
}

.admin-token-input {
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.admin-error {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent-2);
  font-family: var(--font-mono);
}

.admin-input-error {
  border-color: var(--accent-2);
  box-shadow: 3px 3px 0 var(--accent-2);
}

.admin-submit {
  width: 100%;
  margin-top: 0.2rem;
}

/* ── 已验证栏 ── */
.admin-logged-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.7rem;
  background: var(--accent-6);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
}

.admin-logged-text {
  font-size: 0.78rem;
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--badge-avail-ink);
}

.admin-logout-btn {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  font-weight: 700;
  background: var(--btn-secondary-bg);
  border: var(--border-thin);
  padding: 0.2rem 0.6rem;
  cursor: pointer;
  color: var(--btn-secondary-ink);
  border-radius: var(--radius-sm);
  transition: background 0.15s ease, color 0.15s ease;
}

.admin-logout-btn:hover {
  background: var(--accent-2);
  color: var(--accent-ink);
}

/* ── PIN 6格输入 ── */
.admin-pin-inputs {
  display: flex;
  gap: 0.45rem;
}

.admin-pin-box {
  flex: 1;
  min-width: 0;
  height: 48px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 1.3rem;
  font-weight: 700;
  background: var(--input-bg);
  border: var(--input-border);
  color: var(--ink);
  border-radius: var(--radius-sm);
  transition: box-shadow 0.2s var(--ease), background 0.15s ease;
}

.admin-pin-box:hover {
  box-shadow: 2px 2px 0 var(--accent-3);
}

.admin-pin-box:focus {
  outline: none;
  box-shadow: 3px 3px 0 var(--accent);
}

/* ── 结果 ── */
.admin-result {
  margin: 0;
  padding: 0.7rem 0.9rem;
  font-size: 0.82rem;
  font-family: var(--font-mono);
  font-weight: 700;
  line-height: 1.6;
  border: var(--border-thin);
  background: var(--surface-2);
  color: var(--accent-2);
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.admin-result.success {
  background: var(--accent-6);
  color: var(--badge-avail-ink);
}

.admin-footer-note {
  margin: 1rem 0 0;
  text-align: center;
  font-size: 0.72rem;
  color: var(--text-3);
  font-family: var(--font-mono);
  line-height: 1.6;
}

/* ================================================================
   主题差异化
   ================================================================ */
[data-theme="editorial"] .admin-card {
  border-radius: 14px;
  box-shadow: var(--shadow-1);
}
</style>
