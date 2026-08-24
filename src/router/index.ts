// ================================================
// src/router/index.ts — Hash 路由
// 选 hash 而非 history：GitHub Pages 无需 SPA fallback 配置，
// 且后续打包成小红书 mini-tool zip 时深链接天然可用。
// ================================================

import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/HomePage.vue'),
      meta: { title: '邻里好物 — 社区闲置互助' },
    },
    {
      path: '/publish',
      name: 'publish',
      component: () => import('@/pages/PublishPage.vue'),
      meta: { title: '发布闲置 — 邻里好物' },
    },
    {
      path: '/items/:id(\\d+)',
      name: 'item-detail',
      component: () => import('@/pages/DetailPage.vue'),
      meta: { title: '物品详情 — 邻里好物' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  if (typeof document !== 'undefined') {
    document.title = (to.meta.title as string) ?? '邻里好物'
  }
})

export { router }
