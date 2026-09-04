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

/**
 * 等路由过渡真正完成后再取 DOM。
 * 页面切换是 mode="out-in"：新页要等旧页 leave 结束才挂载，
 * 而 happy-dom 的过渡时长不稳定 —— 固定 sleep 会读到「正在离开」的旧页面。
 */
async function untilContains(text: string, budgetMs = 3000): Promise<string> {
  const deadline = Date.now() + budgetMs
  let html = ''
  do {
    await flush(30)
    html = document.querySelector('#app')!.innerHTML
  } while (!html.includes(text) && Date.now() < deadline)
  return html
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

  it('② 首屏渲染：正式运营无种子数据，显示空列表状态（不白屏）', async () => {
    await flush(120)
    const appHtml = document.querySelector('#app')!.innerHTML
    expect(appHtml).toContain('附近暂无闲置物品')
    expect(document.querySelectorAll('.memphis-card').length).toBe(0)
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
    const appHtml = await untilContains('发布闲置物品')
    expect(appHtml).toContain('发布闲置物品')
    // 已登录：直接展示表单（分类下拉存在）
    expect(document.querySelector('select')!).toBeTruthy()
    // 定位状态区存在（geolocation 不可用时显示失败提示，不阻塞）
    expect(appHtml).toContain('定位')
    // 返回首页
    const back = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/"]')][0]!
    back.click()
    expect(await untilContains('让好物在')).toContain('让好物在')
  })

  it('⑥ 正式运营空列表：首页无物品卡片链接（无幽灵数据/种子残留）', async () => {
    await flush(120)
    const cardLinks = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#/items/"]')]
    expect(cardLinks).toHaveLength(0)
    // 首页仍保持稳定渲染（空态 + 页脚），不白屏
    expect(document.querySelector('#app')!.innerHTML).toContain('邻里好物')
  })

  it('⑦ 「我的发布 / 我的借用」为独立页面（首页双卡跳转）', async () => {
    // 回到首页
    const back = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/"]')][0]!
    back.click()
    await untilContains('让好物在')
    // 首页双大卡是跳转链接
    const mineLink = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/mine"]')][0]
    const borrowLink = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/borrows"]')][0]
    expect(mineLink).toBeTruthy()
    expect(borrowLink).toBeTruthy()
    // 我的发布页
    mineLink!.click()
    let html = await untilContains('你还没有发布过物品')
    expect(html).toContain('我的发布')
    expect(html).toContain('你还没有发布过物品')
    // 我的借用页
    borrowLink!.click()
    html = await untilContains('你还没有借用的物品')
    expect(html).toContain('我的借用')
    expect(html).toContain('你还没有借用的物品')
  })
})
