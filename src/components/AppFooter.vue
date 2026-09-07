<script setup lang="ts">
// 页脚：品牌口号 + 链接 + 版权行（纯离线，无外链）
import { RouterLink } from 'vue-router'

// 构建时注入的版本信息（vite define）：每次部署重新构建后，构建时间会变化，
// 刷新页面即可确认线上是否已更新到最新版本。
const appVersion = __APP_VERSION__
const buildTime = new Date(__BUILD_TIME__).toLocaleString('zh-CN', { hour12: false })
</script>

<template>
  <footer class="site-footer">
    <div class="footer-top-row">
      <div class="footer-slogan">邻里好物 · 让闲置在邻里间发光发热</div>
      <ul class="footer-links-list">
        <li><RouterLink to="/">首页</RouterLink></li>
        <li><RouterLink to="/publish">发布闲置</RouterLink></li>
      </ul>
    </div>
    <div class="footer-bot-row">数据保存在本机 · 离线可用 · © 2026 邻里好物</div>
    <div class="footer-version-row" title="构建时自动注入，用于确认线上版本">
      v{{ appVersion }} · 构建于 {{ buildTime }}
    </div>
    <div class="footer-copyright-row">© 2026 邻里好物 · 保留所有权利</div>
  </footer>
</template>

<style scoped>
.site-footer {
  margin-top: 3rem;
  border-top: var(--border-thin);
  background: var(--topbar-bg);
  padding: 1.6rem 1rem calc(1.6rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  position: relative;
  z-index: 10;
}

@media (min-width: 768px) {
  .site-footer {
    padding: 2rem 1.5rem 2.2rem;
  }
}

.footer-top-row {
  max-width: var(--container-max);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: var(--border-dashed);
}

@media (min-width: 768px) {
  .footer-top-row {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}

.footer-slogan {
  font-family: var(--font-head);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ink);
}

.footer-links-list {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  list-style: none;
}

.footer-links-list a {
  display: inline-block;
  min-height: 40px;
  line-height: 2.2;
  padding: 0 0.9rem;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 700;
  border: var(--border-thin);
  background: var(--surface);
  box-shadow: 2px 2px 0 var(--accent-5);
  transition:
    background var(--ease-snap),
    color var(--ease-snap),
    transform 0.2s var(--ease);
}

.footer-links-list a:hover {
  background: var(--accent-2);
  color: var(--accent-ink);
  transform: translate(-2px, -2px);
}

.footer-bot-row {
  max-width: var(--container-max);
  margin: 0 auto;
  padding-top: 1.25rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--text-2);
}

.footer-version-row {
  max-width: var(--container-max);
  margin: 0.35rem auto 0;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-3);
  user-select: text;
}

.footer-copyright-row {
  max-width: var(--container-max);
  margin: 0.15rem auto 0;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-3);
}
</style>
