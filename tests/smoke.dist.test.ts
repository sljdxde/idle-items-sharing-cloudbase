// ================================================
// tests/smoke.dist.test.ts — 生产包冒烟测试（happy-dom 真跑 dist 产物）
// 先 npm run build 再跑；验证：挂载成功 / 首屏渲染 / hash 导航 / 持久化
// ================================================

// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const DIST = join(__dirname, '..', 'dist')

function flush(ms = 60): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('dist 产物冒烟（模拟容器 WebView）', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const js = readFileSync(join(DIST, 'assets', 'app.js'), 'utf8')

  beforeAll(() => {
    // 模拟离线：fetch 立即失败，使数据层回退到种子兜底（仅验证 UI 渲染，与部署网络无关）
    ;(window as any).fetch = () => Promise.reject(new Error('offline'))
    document.head.innerHTML = html.slice(
      html.indexOf('<head>') + 6,
      html.indexOf('</head>'),
    )
    document.body.innerHTML = '<div id="app"></div>'
    // 以经典脚本方式执行产物（等价容器的 <script src> defer）
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

  it('② 首屏渲染物品卡片（快照/种子兜底）', async () => {
    await flush(120)
    expect(document.querySelectorAll('.memphis-card').length).toBeGreaterThanOrEqual(1)
  })

  it('③ CSS 运行时注入生效（孟菲斯底纹 tokens 存在）', async () => {
    await flush()
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('')
    expect(styles).toContain('--bg-cream')
  })

  it('④ 点击「发布闲置」链接路由到发布页', async () => {
    // 真实用户路径：RouterLink 拦截 click 程序化导航（不依赖容器的 hashchange 派发）
    const link = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/publish"]')][0]!
    link.click()
    await flush(120)
    expect(document.querySelector('#app')!.innerHTML).toContain('发布闲置物品')
    // 分类下拉存在
    expect(document.querySelector('select')!).toBeTruthy()
    // 返回首页
    const back = [...document.querySelectorAll<HTMLAnchorElement>('a[href="#/"]')][0]!
    back.click()
    await flush(120)
    expect(document.querySelector('#app')!.innerHTML).toContain('让好物在')
  })

  it('⑤ 点击卡片进入详情页 + 数据读取', async () => {
    const card = document.querySelector<HTMLAnchorElement>('a[href="#/items/1"]')!
    card.click()
    await flush(120)
    const appHtml = document.querySelector('#app')!.innerHTML
    expect(appHtml).toContain('戴森V8吸尘器')
    // 管理按钮在详情页可用
    expect(appHtml).toContain('管理此物品')
  })
})
