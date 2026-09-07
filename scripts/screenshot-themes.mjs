// ================================================
// 三主题 × 多页面 × 桌面/移动 截图验证脚本
// ================================================
import puppeteer from 'puppeteer-core'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://127.0.0.1:5199'
const OUT_DIR = '/Users/yuzhou/004个人代码仓库/idle-items-sharing-cloudbase/ui-preview/shots-v3'

const THEMES = ['memphis', 'brutalism', 'editorial']
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1 }
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 }

// 确保输出目录存在
import { mkdirSync } from 'fs'
mkdirSync(OUT_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('llhw-theme', t)
    document.documentElement.dataset.theme = t
  }, theme)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(500)
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await sleep(500)
  } catch (e) {
    console.log(`  [warn] goto ${url} timeout, continuing anyway`)
  }
}

async function screenshot(page, name) {
  const path = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  console.log(`  ✓ ${name}.png`)
}

async function runViewport(browser, viewport, label) {
  const page = await browser.newPage()
  await page.setViewport(viewport)

  for (const theme of THEMES) {
    console.log(`\n[${label}] 主题: ${theme}`)
    await safeGoto(page, BASE_URL + '/')
    await setTheme(page, theme)

    // 首页
    await screenshot(page, `${label}-${theme}-home`)

    // 尝试获取第一个物品详情页链接
    let detailUrl = null
    try {
      detailUrl = await page.evaluate(() => {
        const link = document.querySelector('.card-heading a, .cell-text a, h2 a, h3 a')
        return link ? link.getAttribute('href') : null
      })
    } catch (e) { /* ignore */ }

    // 详情页
    if (detailUrl) {
      await safeGoto(page, BASE_URL + detailUrl)
      await screenshot(page, `${label}-${theme}-detail`)
    } else {
      console.log('  [skip] detail (no item link found)')
    }

    // 发布页
    await safeGoto(page, BASE_URL + '/publish')
    await screenshot(page, `${label}-${theme}-publish`)

    // 我的发布页
    await safeGoto(page, BASE_URL + '/mine')
    await screenshot(page, `${label}-${theme}-mine`)

    // 我的借用页
    await safeGoto(page, BASE_URL + '/borrows')
    await screenshot(page, `${label}-${theme}-borrows`)

    // 管理员重置页
    await safeGoto(page, BASE_URL + '/admin-reset')
    await screenshot(page, `${label}-${theme}-admin`)
  }

  await page.close()
}

async function main() {
  console.log('启动 Chrome...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  })

  try {
    console.log('\n========== 桌面视口 1280×900 ==========')
    await runViewport(browser, DESKTOP, 'desktop')

    console.log('\n========== 移动视口 390×844 ==========')
    await runViewport(browser, MOBILE, 'mobile')
  } finally {
    await browser.close()
  }

  console.log('\n✅ 全部截图完成，输出目录:', OUT_DIR)
}

main().catch((e) => {
  console.error('截图脚本失败:', e)
  process.exit(1)
})
