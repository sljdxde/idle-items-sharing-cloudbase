<script setup lang="ts">
// 顶部导航：几何 brand 图标 + 当前页高亮 + 手机号登录态 + 三主题切换
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { useThemeStore } from '@/stores/theme'
import type { ThemeId } from '@/stores/theme'
import LoginModal from '@/components/LoginModal.vue'

const auth = useAuthStore()
const toast = useToast()
const themeStore = useThemeStore()

const loginOpen = ref(false)
const themePanelOpen = ref(false)

interface ThemeOption {
  id: ThemeId
  name: string
  desc: string
  swatches: string[]
}

const themes: ThemeOption[] = [
  { id: 'memphis', name: '孟菲斯拼贴', desc: '撞色硬阴影·胶带·网点', swatches: ['#7209b7', '#e63946', '#e9c46a'] },
  { id: 'brutalism', name: '功能主义', desc: '直角网格·1px边框·无阴影', swatches: ['#111111', '#0000ee', '#f0f3f8'] },
  { id: 'editorial', name: '暖色出版', desc: '圆角衬线·陶土色·柔和阴影', swatches: ['#cc785c', '#f6eae4', '#2b2622'] },
]

function selectTheme(id: ThemeId): void {
  themeStore.setTheme(id)
  themePanelOpen.value = false
}

function onLogout(): void {
  auth.logout()
  toast.info('已退出登录', '下次借用或发布时再登录即可')
}
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="18" height="18"></rect>
            <path d="M3 9h18"></path>
            <path d="M9 21V9"></path>
          </svg>
        </span>
        <RouterLink to="/" class="brand-title">邻里好物</RouterLink>
      </div>
      <nav class="nav-links" aria-label="主导航">
        <RouterLink to="/" class="nav-item" exact-active-class="active">首页</RouterLink>
        <RouterLink to="/publish" class="nav-item nav-publish" active-class="active" aria-label="发布闲置">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
            aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span class="nav-publish-text">发布闲置</span>
        </RouterLink>

        <!-- 主题切换 -->
        <button type="button" class="nav-item theme-switch" @click="themePanelOpen = !themePanelOpen"
          aria-haspopup="true" :aria-expanded="themePanelOpen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2.5 2.5 0 0 0-2 4c.6.8.4 3-2 3Z" />
            <circle cx="7.5" cy="11.5" r="1" />
            <circle cx="11" cy="7.5" r="1" />
            <circle cx="15.5" cy="9.5" r="1" />
          </svg>
          主题切换
        </button>

        <!-- 登录态 -->
        <template v-if="auth.isLoggedIn">
          <span class="user-chip" :title="`当前登录：${auth.maskedPhone}`">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            {{ auth.maskedPhone }}
          </span>
          <button type="button" class="nav-item btn-logout" @click="onLogout">退出</button>
        </template>
        <button v-else type="button" class="nav-item btn-login" @click="loginOpen = true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            aria-hidden="true">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            <path d="M10 17l5-5-5-5"></path>
            <line x1="15" y1="12" x2="3" y2="12"></line>
          </svg>
          登录
        </button>
      </nav>
    </div>
  </header>

  <!-- 主题面板（Teleport 到 body，避免 nav-links overflow 裁剪） -->
  <Teleport to="body">
    <div v-if="themePanelOpen" class="theme-popover-mask" @click="themePanelOpen = false"></div>
    <div v-if="themePanelOpen" class="theme-popover" role="menu">
      <div class="theme-popover-title">选择主题</div>
      <button v-for="t in themes" :key="t.id" type="button" class="theme-option"
        :class="{ active: themeStore.theme === t.id }" role="menuitemradio"
        :aria-checked="themeStore.theme === t.id" @click="selectTheme(t.id)">
        <span class="swatches">
          <i v-for="(c, i) in t.swatches" :key="i" :style="{ background: c }"></i>
        </span>
        <span class="t-text">
          <span class="t-name">{{ t.name }}</span>
          <span class="t-desc">{{ t.desc }}</span>
        </span>
        <span class="t-check">{{ themeStore.theme === t.id ? '✓' : '' }}</span>
      </button>
    </div>
  </Teleport>

  <LoginModal :open="loginOpen" @close="loginOpen = false" />
</template>

<style scoped>
/* ── 顶栏容器（语义化，三主题自动切换） ── */
.topbar {
  background: var(--topbar-bg);
  border-bottom: var(--topbar-border);
  position: var(--topbar-sticky);
  top: 0;
  z-index: 60;
  backdrop-filter: blur(12px);
}

.topbar-inner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  max-width: var(--container-max);
  margin: 0 auto;
  padding: 0.6rem 1rem;
  flex-wrap: nowrap;
}

@media (min-width: 768px) {
  .topbar-inner {
    padding: 0.75rem 1.5rem;
  }
}

/* ── 品牌区 ── */
.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  background: var(--accent-2);
  color: var(--accent-ink);
  border: var(--border-thin);
  box-shadow: 3px 3px 0 var(--ink);
}

.brand-mark svg {
  width: 20px;
  height: 20px;
}

.brand-title {
  font-family: var(--font-head);
  font-size: 1.3rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--ink);
}

/* ── 导航区 ── */
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: 0.5rem;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.nav-links::-webkit-scrollbar {
  display: none;
}

.nav-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 40px;
  padding: 0 0.8rem;
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ink);
  border: var(--border-thin);
  border-color: transparent;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}

.nav-item svg {
  width: 14px;
  height: 14px;
}

.nav-item:hover {
  background: var(--hover-bg);
  border-color: var(--ink);
}

.nav-item.active {
  background: var(--ink);
  color: var(--chip-active-ink);
  border-color: var(--ink);
}

/* ── 主题切换按钮（基础态，各主题在下方覆盖） ── */
.theme-switch {
  color: var(--accent);
  font-weight: 700;
}

.theme-switch svg {
  width: 15px;
  height: 15px;
  color: var(--accent);
}

.theme-switch:hover {
  color: var(--accent-ink);
  background: var(--accent);
  border-color: var(--accent);
}

.theme-switch:hover svg {
  color: var(--accent-ink);
}

/* ── 用户 chip / 登录 / 退出按钮 ── */
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 38px;
  padding: 0 0.7rem;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent-ink);
  background: var(--accent-4);
  border: var(--border-thin);
}

.user-chip svg {
  width: 13px;
  height: 13px;
}

.btn-login {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 38px;
  padding: 0 0.9rem;
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 0.85rem;
  font-weight: 700;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-ink);
  border: var(--border-thin);
}

.btn-login svg {
  width: 14px;
  height: 14px;
}

.btn-logout {
  border: none;
  background: none;
  color: var(--text-2);
  font-size: 0.82rem;
  min-height: 36px;
  padding: 0 0.4rem;
  flex-shrink: 0;
}

/* ── 主题面板 popover（Teleport 到 body，fixed 定位） ── */
.theme-popover-mask {
  position: fixed;
  inset: 0;
  z-index: 159;
  background: transparent;
}

.theme-popover {
  position: fixed;
  top: 64px;
  right: 1rem;
  z-index: 160;
  width: 280px;
  max-width: calc(100vw - 2rem);
  background: var(--surface);
  border: var(--border-thin);
  border-radius: var(--radius);
  box-shadow: var(--shadow-1);
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  animation: popIn 0.2s ease-out;
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.theme-popover-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-3);
  font-family: var(--font-mono);
  letter-spacing: 0.05em;
  padding: 0.15rem 0.4rem 0.4rem;
  border-bottom: 1px dashed var(--text-3);
  margin-bottom: 0.3rem;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.6rem 0.7rem;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition:
    background 0.15s,
    border-color 0.15s;
}

.theme-option:hover {
  background: var(--hover-bg);
  border-color: var(--text-3);
}

.theme-option.active {
  border-color: var(--accent);
  background: var(--hover-bg);
}

.theme-option .swatches {
  display: flex;
  gap: 3px;
  flex: none;
}

.theme-option .swatches i {
  width: 15px;
  height: 15px;
  border: 1px solid color-mix(in srgb, var(--ink) 25%, transparent);
}

.theme-option .t-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.theme-option .t-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.25;
}

.theme-option .t-desc {
  font-size: 0.72rem;
  color: var(--text-3);
  line-height: 1.35;
}

.theme-option .t-check {
  margin-left: auto;
  color: var(--accent);
  font-weight: 900;
  flex: none;
}

/* ============================================================
   三主题差异化覆盖（顺序：nav-item → theme-switch → user-chip/btn-login）
   ============================================================ */

/* ── 孟菲斯拼贴 ── */
[data-theme='memphis'] .topbar-inner {
  padding-top: 1.1rem;
}

[data-theme='memphis'] .brand-mark {
  background: var(--accent-2);
  box-shadow: 3px 3px 0 var(--ink);
}

[data-theme='memphis'] .nav-item {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
}

[data-theme='memphis'] .nav-item.active {
  background: var(--accent-3);
  color: var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

[data-theme='memphis'] .theme-switch {
  background: var(--accent-3);
  color: var(--ink);
  border: 2px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  letter-spacing: 0.02em;
}

[data-theme='memphis'] .theme-switch svg {
  color: var(--ink);
}

[data-theme='memphis'] .theme-switch:hover {
  background: var(--accent-2);
  color: var(--accent-ink);
  border-color: var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

[data-theme='memphis'] .theme-switch:hover svg {
  color: var(--accent-ink);
}

/* ── 功能主义网格 ── */
[data-theme='brutalism'] .brand-mark {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--accent-ink);
  box-shadow: none;
}

[data-theme='brutalism'] .brand-title {
  letter-spacing: -0.02em;
}

[data-theme='brutalism'] .nav-item {
  border: none;
  font-weight: 500;
}

[data-theme='brutalism'] .nav-item:hover {
  background: var(--surface-2);
}

[data-theme='brutalism'] .nav-item.active {
  background: transparent;
  color: var(--ink);
  border-bottom: 2px solid var(--ink);
  border-radius: 0;
}

[data-theme='brutalism'] .theme-switch {
  border: 1px solid var(--ink);
  color: var(--ink);
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  font-weight: 500;
  font-size: 0.85rem;
}

[data-theme='brutalism'] .theme-switch svg {
  color: var(--ink);
}

[data-theme='brutalism'] .theme-switch:hover {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
}

[data-theme='brutalism'] .theme-switch:hover svg {
  color: var(--bg);
}

[data-theme='brutalism'] .user-chip {
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--border);
}

[data-theme='brutalism'] .btn-login {
  border: 1px solid var(--ink);
}

/* ── 暖色出版物 ── */
[data-theme='editorial'] .brand-mark {
  background: var(--accent-3);
  color: var(--accent);
  border: 1.5px solid var(--accent);
  box-shadow: none;
}

[data-theme='editorial'] .brand-title {
  font-family: var(--font-head);
  letter-spacing: -0.01em;
}

[data-theme='editorial'] .nav-item {
  border: none;
  position: relative;
  font-size: 0.94rem;
  font-weight: 500;
}

[data-theme='editorial'] .nav-item::after {
  content: '';
  position: absolute;
  bottom: 8px;
  left: 0.25rem;
  width: 0;
  height: 2px;
  background: var(--accent);
  transition: width 0.3s;
}

[data-theme='editorial'] .nav-item:hover::after,
[data-theme='editorial'] .nav-item.active::after {
  width: calc(100% - 0.5rem);
}

[data-theme='editorial'] .nav-item.active {
  background: transparent;
  color: var(--accent-2);
  border: none;
}

[data-theme='editorial'] .theme-switch {
  border-radius: 100px;
  color: var(--accent-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-family: var(--font-serif);
  font-weight: 500;
  font-size: 0.92rem;
  box-shadow: none;
}

[data-theme='editorial'] .theme-switch svg {
  color: var(--accent-2);
}

[data-theme='editorial'] .theme-switch:hover {
  background: var(--accent-2);
  color: var(--accent-ink);
  border-color: var(--accent-2);
}

[data-theme='editorial'] .theme-switch:hover svg {
  color: var(--accent-ink);
}

[data-theme='editorial'] .user-chip {
  background: var(--accent-3);
  color: var(--accent-2);
  border: 1px solid var(--accent-4);
  border-radius: 999px;
}

[data-theme='editorial'] .btn-login {
  border-radius: 8px;
}

/* ============================================================
   响应式：≤640px 两行布局（品牌在上，导航滚动在下）
   ============================================================ */
@media (max-width: 640px) {
  .topbar-inner {
    flex-wrap: wrap;
    row-gap: 0.2rem;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .nav-links {
    order: 3;
    flex: 1 1 100%;
    overflow-x: auto;
    margin-left: 0;
    padding: 0.15rem 0 0;
  }

  .brand-mark {
    width: 30px;
    height: 30px;
    box-shadow: 2px 2px 0 var(--ink);
  }

  .brand-mark svg {
    width: 16px;
    height: 16px;
  }

  .brand-title {
    font-size: 1.02rem;
  }

  .nav-item {
    min-height: 36px;
    padding: 0 0.6rem;
    font-size: 0.8rem;
  }

  .theme-switch svg {
    width: 14px;
    height: 14px;
  }

  .user-chip {
    min-height: 32px;
    padding: 0 0.5rem;
    font-size: 0.7rem;
  }

  .user-chip svg {
    display: none;
  }

  .btn-login {
    min-height: 34px;
    padding: 0 0.6rem;
    font-size: 0.78rem;
  }

  .btn-login svg {
    display: none;
  }

  .btn-logout {
    min-height: 32px;
    font-size: 0.74rem;
  }

  .theme-popover {
    top: 96px;
  }
}
</style>
