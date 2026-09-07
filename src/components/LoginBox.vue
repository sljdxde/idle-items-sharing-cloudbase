<script setup lang="ts">
// ================================================
// LoginBox — 手机号 + 管理口令登录（ADR-0005）
// 登录/注册双 Tab，6 格 PIN 输入；JWT 会话由 auth store 管理。
// ================================================

import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { isValidPhone, isWeakPin, weakPinHint } from '@/lib/validate'

const emit = defineEmits<{ loggedIn: [phone: string] }>()

const auth = useAuthStore()
const toast = useToast()

type Tab = 'login' | 'register'
const activeTab = ref<Tab>('login')

// 登录表单
const loginPhone = ref('')
const loginPin = ref<string[]>(['', '', '', '', '', ''])
const loginError = ref('')

// 注册表单
const regPhone = ref('')
const regPin = ref<string[]>(['', '', '', '', '', ''])
const regPin2 = ref<string[]>(['', '', '', '', '', ''])
const regError = ref('')

const submitting = ref(false)

function switchTab(tab: Tab): void {
  activeTab.value = tab
  loginError.value = ''
  regError.value = ''
}

// PIN 输入框联动
function onPinInput(pinArr: string[], index: number, event: Event): void {
  const input = event.target as HTMLInputElement
  const val = input.value.replace(/\D/g, '')
  pinArr[index] = val
  input.value = val
  if (val && index < 5) {
    const next = input.parentElement?.children[index + 1] as HTMLInputElement
    next?.focus()
  }
}

function onPinKeydown(pinArr: string[], index: number, event: KeyboardEvent): void {
  if (event.key === 'Backspace' && !pinArr[index] && index > 0) {
    const prev = (event.target as HTMLInputElement).parentElement?.children[index - 1] as HTMLInputElement
    pinArr[index - 1] = ''
    if (prev) {
      prev.value = ''
      prev.focus()
    }
  }
}

function onPinPaste(pinArr: string[], event: ClipboardEvent): void {
  event.preventDefault()
  const text = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6)
  const container = (event.target as HTMLInputElement).parentElement
  if (!container) return
  text.split('').forEach((ch, i) => {
    pinArr[i] = ch
    const input = container.children[i] as HTMLInputElement
    if (input) input.value = ch
  })
  if (text.length < 6) {
    const next = container.children[text.length] as HTMLInputElement
    next?.focus()
  }
}

function pinToString(pinArr: string[]): string {
  return pinArr.join('')
}

function clearPin(pinArr: string[]): void {
  for (let i = 0; i < 6; i++) pinArr[i] = ''
  // 清空 DOM
  setTimeout(() => {
    document.querySelectorAll<HTMLInputElement>('.pin-box').forEach((el) => {
      el.value = ''
    })
  }, 0)
}

// 登录
async function handleLogin(): Promise<void> {
  loginError.value = ''
  const phone = loginPhone.value.trim()
  const pin = pinToString(loginPin.value)

  if (!phone) {
    loginError.value = '请输入手机号'
    return
  }
  if (!isValidPhone(phone)) {
    loginError.value = '手机号格式不正确'
    return
  }
  if (pin.length < 6) {
    loginError.value = '请输入完整的 6 位管理口令'
    return
  }

  submitting.value = true
  try {
    const res = await auth.login(phone, pin)
    if (res.ok) {
      toast.success('登录成功', `欢迎回来，${auth.maskedPhone}`)
      emit('loggedIn', auth.maskedPhone)
      clearPin(loginPin.value)
      loginPhone.value = ''
    } else {
      loginError.value = res.error || '登录失败'
      clearPin(loginPin.value)
    }
  } finally {
    submitting.value = false
  }
}

// 注册
async function handleRegister(): Promise<void> {
  regError.value = ''
  const phone = regPhone.value.trim()
  const pin = pinToString(regPin.value)
  const pin2 = pinToString(regPin2.value)

  if (!phone) {
    regError.value = '请输入手机号'
    return
  }
  if (!isValidPhone(phone)) {
    regError.value = '手机号格式不正确'
    return
  }
  if (pin.length < 6) {
    regError.value = '请设置 6 位管理口令'
    return
  }
  if (isWeakPin(pin)) {
    regError.value = weakPinHint(pin) || '管理口令过于简单，请换一个'
    return
  }
  if (pin2.length < 6) {
    regError.value = '请再次输入管理口令'
    return
  }
  if (pin !== pin2) {
    regError.value = '两次输入的管理口令不一致'
    clearPin(regPin2.value)
    return
  }

  submitting.value = true
  try {
    const res = await auth.register(phone, pin)
    if (res.ok) {
      toast.success('注册成功', `欢迎加入，${auth.maskedPhone}`)
      toast.info('请牢记口令', '管理口令用于保护你的物品，遗忘后需联系管理员重置')
      emit('loggedIn', auth.maskedPhone)
      clearPin(regPin.value)
      clearPin(regPin2.value)
      regPhone.value = ''
    } else {
      regError.value = res.error || '注册失败'
      clearPin(regPin.value)
      clearPin(regPin2.value)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-box">
    <!-- Tab 切换 -->
    <div class="login-tabs">
      <button
        class="login-tab"
        :class="{ active: activeTab === 'login' }"
        @click="switchTab('login')"
      >
        登录
      </button>
      <button
        class="login-tab"
        :class="{ active: activeTab === 'register' }"
        @click="switchTab('register')"
      >
        注册
      </button>
    </div>

    <!-- 登录面板 -->
    <form v-if="activeTab === 'login'" class="login-form" @submit.prevent="handleLogin">
      <p class="login-tip">使用注册时的手机号和管理口令登录</p>

      <label class="login-field">
        <span class="login-label">手机号</span>
        <input
          v-model="loginPhone"
          type="tel"
          inputmode="numeric"
          maxlength="11"
          class="input"
          :class="{ 'login-input-error': loginError && !loginPhone }"
          placeholder="请输入 11 位手机号"
          autocomplete="tel"
          @input="loginError = ''"
        />
      </label>

      <div class="login-field">
        <span class="login-label">管理口令</span>
        <div class="pin-inputs">
          <input
            v-for="(_, i) in 6"
            :key="i"
            class="pin-box"
            type="password"
            maxlength="1"
            inputmode="numeric"
            :value="loginPin[i]"
            @input="onPinInput(loginPin, i, $event)"
            @keydown="onPinKeydown(loginPin, i, $event)"
            @paste="onPinPaste(loginPin, $event)"
          />
        </div>
        <p class="login-hint">6 位数字，注册时自行设置</p>
      </div>

      <p v-if="loginError" class="login-error" role="alert">{{ loginError }}</p>

      <button type="submit" class="btn-primary login-submit" :disabled="submitting">
        {{ submitting ? '登录中…' : '登 录' }}
      </button>
    </form>

    <!-- 注册面板 -->
    <form v-else class="login-form" @submit.prevent="handleRegister">
      <p class="login-tip">首次使用请注册。管理口令用于保护你的物品，遗忘后可联系管理员重置。</p>

      <label class="login-field">
        <span class="login-label">手机号</span>
        <input
          v-model="regPhone"
          type="tel"
          inputmode="numeric"
          maxlength="11"
          class="input"
          :class="{ 'login-input-error': regError && !regPhone }"
          placeholder="请输入 11 位手机号"
          autocomplete="tel"
          @input="regError = ''"
        />
      </label>
      <p class="login-hint">用于登录和账号恢复，不会公开显示</p>

      <div class="login-field">
        <span class="login-label">设置管理口令</span>
        <div class="pin-inputs">
          <input
            v-for="(_, i) in 6"
            :key="'p1-' + i"
            class="pin-box"
            type="password"
            maxlength="1"
            inputmode="numeric"
            :value="regPin[i]"
            @input="onPinInput(regPin, i, $event)"
            @keydown="onPinKeydown(regPin, i, $event)"
            @paste="onPinPaste(regPin, $event)"
          />
        </div>
        <p class="login-hint">6 位数字，用于发布/删除/借用等操作鉴权</p>
      </div>

      <div class="login-field">
        <span class="login-label">确认管理口令</span>
        <div class="pin-inputs">
          <input
            v-for="(_, i) in 6"
            :key="'p2-' + i"
            class="pin-box"
            type="password"
            maxlength="1"
            inputmode="numeric"
            :value="regPin2[i]"
            @input="onPinInput(regPin2, i, $event)"
            @keydown="onPinKeydown(regPin2, i, $event)"
            @paste="onPinPaste(regPin2, $event)"
          />
        </div>
      </div>

      <p v-if="regError" class="login-error" role="alert">{{ regError }}</p>

      <button type="submit" class="btn-primary login-submit" :disabled="submitting">
        {{ submitting ? '注册中…' : '注 册' }}
      </button>
    </form>

    <!-- 底部辅助 -->
    <p class="login-footer">
      忘记管理口令？请联系社区管理员重置
    </p>
  </div>
</template>

<style scoped>
.login-box {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: var(--border-dashed);
  background: var(--surface);
  overflow: hidden;
}

/* Tab 切换 */
.login-tabs {
  display: flex;
  border-bottom: var(--border-thin);
  background: var(--bg);
}
.login-tab {
  flex: 1;
  padding: 0.75rem 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--ink);
  transition: background 0.15s ease;
}
.login-tab:first-child {
  border-right: var(--border-thin);
}
.login-tab:hover {
  background: var(--accent-3);
}
.login-tab.active {
  background: var(--surface);
  color: var(--accent);
}

/* 表单 */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.1rem;
}

.login-tip {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-2);
  line-height: 1.6;
  padding: 0.5rem 0.7rem;
  background: var(--bg);
  border-left: 3px solid var(--accent-3);
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.login-label {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink);
}

.login-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-3);
  font-family: var(--font-mono);
}

/* PIN 6格输入 */
.pin-inputs {
  display: flex;
  gap: 0.45rem;
}
.pin-box {
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
  transition: box-shadow 0.2s var(--ease), background 0.15s ease;
}
.pin-box:hover {
  box-shadow: 2px 2px 0 var(--accent-3);
}
.pin-box:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-4);
  background: var(--input-bg);
}

.login-error {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent-2);
  font-family: var(--font-mono);
}

.login-input-error {
  border-color: var(--accent-2);
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--accent-2) 35%, transparent);
}

.login-submit {
  width: 100%;
  margin-top: 0.3rem;
}

.login-footer {
  margin: 0;
  padding: 0.7rem 1.1rem;
  border-top: var(--border-dashed);
  background: var(--bg);
  font-size: 0.75rem;
  color: var(--text-3);
  text-align: center;
  line-height: 1.5;
}
</style>
