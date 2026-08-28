<script setup lang="ts">
// 顶部导航：几何 brand 图标 + 当前页高亮 + 手机号登录态
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import LoginModal from '@/components/LoginModal.vue'

const auth = useAuthStore()
const toast = useToast()

const loginOpen = ref(false)

function onLogout(): void {
  auth.logout()
  toast.info('已退出登录', '下次借用或发布时再登录即可')
}
</script>

<template>
  <header class="memphis-header">
    <div class="brand-group">
      <span class="brand-geom-icon" aria-hidden="true">
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

      <!-- 登录态 -->
      <template v-if="auth.isLoggedIn">
        <span class="user-chip" :title="`当前登录：${auth.phone}`">
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
  </header>

  <LoginModal :open="loginOpen" @close="loginOpen = false" />
</template>

<style scoped>
.memphis-header {
  max-width: var(--container-max);
  margin: 0 auto;
  padding: 1.25rem 1rem 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: nowrap;
}

@media (min-width: 768px) {
  .memphis-header {
    padding: 1.75rem 1.5rem 0.5rem;
  }
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.brand-geom-icon {
  display: inline-flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  background: var(--retro-red);
  color: var(--paper-cream);
  border: 2.5px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.brand-geom-icon svg {
  width: 22px;
  height: 22px;
}

.brand-title {
  font-family: var(--font-serif);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: nowrap;
}

.nav-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 44px;
  padding: 0 0.9rem;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 700;
  border: 2px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background var(--ease-snap),
    border-color var(--ease-snap),
    box-shadow 0.2s var(--ease);
}

.nav-item:hover {
  border-color: var(--ink);
  box-shadow: 3px 3px 0 var(--mustard);
}

.nav-item.active {
  background: var(--mustard);
  border-color: var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.nav-publish.active {
  background: var(--salmon);
}

/* 登录态 */
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 40px;
  padding: 0 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
  background: var(--royal-blue);
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  white-space: nowrap;
}

.btn-login {
  background: var(--ink);
  color: var(--mustard);
  border-color: var(--ink);
}

.btn-login:hover {
  background: var(--retro-red);
  color: #fff;
  border-color: var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.btn-logout {
  background: transparent;
  cursor: pointer;
}

@media (max-width: 640px) {
  .memphis-header {
    padding: 0.9rem 0.75rem 0.4rem;
    gap: 0.5rem;
  }

  .brand-geom-icon {
    width: 34px;
    height: 34px;
    box-shadow: 2px 2px 0 var(--ink);
  }

  .brand-geom-icon svg {
    width: 18px;
    height: 18px;
  }

  .brand-title {
    font-size: 1.12rem;
    letter-spacing: 0.01em;
  }

  .nav-links {
    gap: 0.35rem;
  }

  .nav-item {
    min-height: 40px;
    padding: 0 0.5rem;
    font-size: 0.78rem;
    gap: 0.25rem;
  }

  .user-chip {
    min-height: 36px;
    padding: 0 0.55rem;
    font-size: 0.72rem;
    gap: 0.25rem;
  }
}

@media (max-width: 420px) {
  .memphis-header {
    padding: 0.7rem 0.6rem 0.35rem;
    gap: 0.4rem;
  }

  .brand-geom-icon {
    width: 30px;
    height: 30px;
  }

  .brand-geom-icon svg {
    width: 16px;
    height: 16px;
  }

  .brand-group {
    gap: 0.4rem;
  }

  .brand-title {
    font-size: 1rem;
  }

  .nav-links {
    gap: 0.25rem;
  }

  /* 发布入口图标化，文字隐藏（aria-label 保留） */
  .nav-publish-text {
    display: none;
  }

  .nav-item {
    min-height: 36px;
    padding: 0 0.4rem;
    font-size: 0.72rem;
  }

  .user-chip {
    min-height: 32px;
    padding: 0 0.45rem;
    font-size: 0.68rem;
  }
}

@media (max-width: 360px) {
  .memphis-header {
    padding: 0.6rem 0.5rem 0.3rem;
    gap: 0.3rem;
  }

  .brand-geom-icon {
    width: 26px;
    height: 26px;
  }

  .brand-geom-icon svg {
    width: 14px;
    height: 14px;
  }

  .brand-title {
    font-size: 0.9rem;
  }

  .nav-links {
    gap: 0.2rem;
  }

  .nav-item {
    padding: 0 0.35rem;
    font-size: 0.68rem;
  }

  /* 手机号 chip 隐藏图标、缩字号，保住 320px 单行 */
  .user-chip svg {
    display: none;
  }

  .user-chip {
    min-height: 28px;
    padding: 0 0.35rem;
    font-size: 0.6rem;
    gap: 0;
  }
}
</style>
