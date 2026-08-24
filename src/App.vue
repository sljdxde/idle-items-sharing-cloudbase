<script setup lang="ts">
// ================================================
// src/App.vue — 根组件：导航 + 路由视图 + 页脚 + Toast
// ================================================

import { RouterView } from 'vue-router'
import AppNavbar from '@/components/AppNavbar.vue'
import AppFooter from '@/components/AppFooter.vue'
import ToastHost from '@/components/ToastHost.vue'
</script>

<template>
  <div class="app-shell">
    <AppNavbar />
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
    <AppFooter />
    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 0;
}

.app-shell > :deep(main) {
  flex: 1;
}

.page-enter-active {
  transition: opacity 0.22s var(--ease);
}

.page-leave-active {
  transition: opacity 0.16s ease-in;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
