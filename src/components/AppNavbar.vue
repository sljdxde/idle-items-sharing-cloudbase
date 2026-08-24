<script setup lang="ts">
// 顶部导航：几何 brand 图标 + 当前页高亮
import { RouterLink } from 'vue-router'
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
      <RouterLink to="/publish" class="nav-item nav-publish" active-class="active">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
          aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        发布闲置
      </RouterLink>
    </nav>
  </header>
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
}

.nav-links {
  display: flex;
  gap: 0.6rem;
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
</style>
