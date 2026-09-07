// 补充截图：hash 路由下的各页面 + 登录弹窗
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:5199/#'
const OUT = '/Users/yuzhou/004个人代码仓库/idle-items-sharing-cloudbase/ui-preview/shots-v3'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })

  const pages = [
    ['publish', '/publish'],
    ['mine', '/mine'],
    ['borrows', '/borrows'],
    ['admin', '/admin/reset-pin'],
  ]

  for (const theme of ['memphis', 'brutalism', 'editorial']) {
    // 设置主题
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate((t) => {
      localStorage.setItem('llhw-theme', t)
      document.documentElement.dataset.theme = t
    }, theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(500)

    for (const [name, path] of pages) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      await sleep(600)
      await page.screenshot({ path: `${OUT}/desktop-${theme}-${name}.png`, fullPage: true })
      console.log(`✓ desktop-${theme}-${name}.png`)
    }

    // 登录弹窗
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await sleep(500)
    // 点击登录按钮
    try {
      await page.click('.btn-login, .nav-item.btn-login')
      await sleep(600)
      await page.screenshot({ path: `${OUT}/desktop-${theme}-login-modal.png`, fullPage: false })
      console.log(`✓ desktop-${theme}-login-modal.png`)
    } catch (e) {
      console.log(`  [skip] login modal: ${e.message}`)
    }
  }

  await browser.close()
  console.log('\n✅ 补充截图完成')
}
main().catch((e) => { console.error(e); process.exit(1) })
