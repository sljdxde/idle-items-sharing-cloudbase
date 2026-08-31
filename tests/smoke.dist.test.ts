// ================================================
// tests/smoke.dist.test.ts — 生产包冒烟测试（happy-dom 真跑 dist 产物）
// 先 npm run build 再跑；验证：挂载成功 / 首屏渲染（默认隐藏已借出）/ hash 导航 / 登录态
// ================================================

// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const DIST = join(__dirname, '..', 'dist')

function flush(ms = 60): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('dist 产物冒烟（模拟浏览器）', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const js = readFileSync(join(DIST, 'assets', 'app.js'), 'utf8')

  beforeAll(() => {
    // 预置手机号登录态（种子物品的物主是 1380000000x，登录 13812345678 即「非物主」视角）
    localStorage.setItem('linli_haowu_user_v1', '13812345678')
    // 模拟离线：全局 fetch 立即失败（happy-dom 中 window 与 globalThis 不同步，两处都要设），
    // 使数据层回退到种子兜底（仅验证 UI 渲染，与部署网络无关）
    const offlineFetch = () => Promise.reject(new Error('offline'))
    ;(window as any).fetch = offlineFetch
    ;(globalThis as any).fetch = offlineFetch
    document.head.innerHTML = html.slice(
      html.indexOf('<head>') + 6,
      html.indexOf('</head>'),
    )
    document.body.innerHTML = '<div id="app"></div>'
    // 以经典脚本方式执行产物
    // eslint-disable-next-line no-eval
    window.eval(js)
  })

  it('① Vue 应用挂载成功，渲染出首页 Hero', async () => {
    await flush()
    const app = document.querySelector('#app')!
    expect(app.innerHTML.length).toBeGreaterThan(500)
    expect(app.innerHTML).toContain('让好物在')
    expect(app.innerHTML).toContain('发布我的闲置')
  })

  it('② 首屏渲染物品卡片（本地种子数据）', async () => {
    await flush(120)
    expect(document.querySelectorAll('.memphis-card').length).toBeGreaterThanOrEqual(1)
  })

  it('③ 默认隐藏已借出物品（开关关闭时列表无「已借出」卡片）', async () => {
    await flush()
    const appHtml = document.querySelector('#app')!.innerHTML
    // 种子里的「电钻+全套钻头」为 lent 状态，默认不应出现
    expect(appHtml).not.toContain('电钻')
    // 筛选开关「显示已借出」存在且默认未激活
    const lentChip = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.includes('显示已借出'),
    )
    expect(lentChip).toBeTruthy()
    expect(lentChip!.classList.contains('active')).toBe(false)
  })

  it('④ CSS 运行时注入生效（孟菲斯底纹 tokens 存在）', async () => {
    await flush()
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('')
    expect(styles).toContain('--bg-cream')
  })

  it('⑤ 点击「发布闲置」路由到发布页（已登录 → 表单 + 自动定位区）', async () => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/publish"]')][0]!
    link.click()
    await flush(120)
    const appHtml = document.querySelector('#app')!.innerHTML
    expect(appHtml).toContain('发布闲置物品')
    // 已登录：直接展示表单（分类下拉存在）
    expect(document.querySelector('select')!).toBeTruthy()
    // 定位状态区存在（geolocation 不可用时显示失败提示，不阻塞）
    expect(appHtml).toContain('定位')
    // 返回首页
    const back = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/"]')][0]!
    back.click()
    await flush(120)
    expect(document.querySelector('#app')!.innerHTML).toContain('让好物在')
  })

  it('⑥ 点击卡片进入详情页 + 数据读取', async () => {
    const card = document.querySelector<HTMLAnchorElement>('a[href="#/items/1"]')!
    card.click()
    await flush(120)
    const appHtml = document.querySelector('#app')!.innerHTML
    expect(appHtml).toContain('戴森V8吸尘器')
    // 非物主视角：展示「我想借」
    expect(appHtml).toContain('我想借')
  })

  it('⑦ 「我的发布 / 我的借用」为独立页面（首页双卡跳转）', async () => {
    // 回到首页
    const back = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/"]')][0]!
    back.click()
    await flush(120)
    // 首页双大卡是跳转链接
    const mineLink = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/mine"]')][0]
    const borrowLink = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/borrows"]')][0]
    expect(mineLink).toBeTruthy()
    expect(borrowLink).toBeTruthy()
    // 我的发布页
    mineLink!.click()
    await flush(120)
    let html = document.querySelector('#app')!.innerHTML
    expect(html).toContain('我的发布')
    expect(html).toContain('你还没有发布过物品')
    // 我的借用页
    borrowLink!.click()
    await flush(120)
    html = document.querySelector('#app')!.innerHTML
    expect(html).toContain('我的借用')
    expect(html).toContain('你还没有借用的物品')
  })
})
