// ================================================
// src/router/index.ts — Hash 路由（离线容器内为纯客户端视图切换）
// 静态导入：构建为 IIFE 单包，容器 CSP 禁止动态 module 加载
// ================================================

import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'
import PublishPage from '@/pages/PublishPage.vue'
import DetailPage from '@/pages/DetailPage.vue'
import MinePage from '@/pages/MinePage.vue'
import BorrowsPage from '@/pages/BorrowsPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
      meta: { title: '邻里好物 — 社区闲置互助' },
    },
    {
      path: '/publish',
      name: 'publish',
      component: PublishPage,
      meta: { title: '发布闲置 — 邻里好物' },
    },
    {
      path: '/mine',
      name: 'mine',
      component: MinePage,
      meta: { title: '我的发布 — 邻里好物' },
    },
    {
      path: '/borrows',
      name: 'borrows',
      component: BorrowsPage,
      meta: { title: '我的借用 — 邻里好物' },
    },
    {
      path: '/items/:id(\\d+)',
      name: 'item-detail',
      component: DetailPage,
      meta: { title: '物品详情 — 邻里好物' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(_to, _from, saved) {
    // 首页是无限滚动：从详情返回时保留原位置，否则会掉回第一页
    return saved ?? { top: 0 }
  },
})

router.afterEach((to) => {
  if (typeof document !== 'undefined') {
    document.title = (to.meta.title as string) ?? '邻里好物'
  }
})

export { router }
