<script setup lang="ts">
// 页脚：品牌口号 + 链接 + 版权行
import { RouterLink } from 'vue-router'
import { REPO_URL } from '@/lib/config'
</script>

<template>
  <footer class="memphis-footer">
    <div class="footer-top-row">
      <div class="footer-slogan">邻里好物 · 让闲置在邻里间发光发热</div>
      <ul class="footer-links-list">
        <li><RouterLink to="/">首页</RouterLink></li>
        <li><RouterLink to="/publish">发布闲置</RouterLink></li>
        <li>
          <a :href="REPO_URL" target="_blank" rel="noopener noreferrer">GitHub</a>
        </li>
      </ul>
    </div>
    <div class="footer-bot-row">由社区共建 · 数据存于 GitHub Issues · © 2026 邻里好物</div>
  </footer>
</template>

<style scoped>
.memphis-footer {
  margin-top: 3rem;
  background: var(--ink);
  color: var(--paper-cream);
  padding: 2.5rem 1.5rem 2rem;
  position: relative;
  z-index: 10;
}

@media (min-width: 768px) {
  .memphis-footer {
    padding: 3.5rem 2.5rem 2.5rem;
  }
}

.footer-top-row {
  max-width: var(--container-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 2rem;
  border-bottom: 2px dashed rgba(255, 255, 255, 0.25);
}

@media (min-width: 768px) {
  .footer-top-row {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}

.footer-slogan {
  font-family: var(--font-serif);
  font-size: 1.4rem;
  color: var(--mustard);
}

.footer-links-list {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  list-style: none;
}

.footer-links-list a {
  display: inline-block;
  min-height: 44px;
  line-height: 2.4;
  padding: 0 0.9rem;
  color: var(--paper-cream);
  font-family: var(--font-mono);
  font-size: 0.92rem;
  font-weight: 700;
  border: 1.5px solid var(--paper-cream);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 2px 2px 0 var(--salmon);
  transition:
    background var(--ease-snap),
    color var(--ease-snap),
    transform 0.2s var(--ease);
}

.footer-links-list a:hover {
  background: var(--retro-red);
  color: #fff;
  transform: translate(-2px, -2px);
}

.footer-bot-row {
  max-width: var(--container-max);
  margin: 0 auto;
  padding-top: 1.75rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: #ccc;
}
</style>
