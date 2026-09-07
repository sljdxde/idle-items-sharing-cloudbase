// 聚焦截图：有物品时的三主题首页（验证 brutalism 表格形态）
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'fs'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://127.0.0.1:5199'
const OUT_DIR = '/Users/yuzhou/004个人代码仓库/idle-items-sharing-cloudbase/ui-preview/shots-v3'
mkdirSync(OUT_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  })

  const THEMES = ['memphis', 'brutalism', 'editorial']

  // 桌面
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })

  for (const theme of THEMES) {
    console.log(`[desktop] ${theme}...`)
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate((t) => {
      localStorage.setItem('llhw-theme', t)
      localStorage.setItem('linli_haowu_pos_v1', JSON.stringify({ lat: 30.2741, lng: 120.1551 }))
      document.documentElement.dataset.theme = t
    }, theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(800)
    await page.screenshot({ path: `${OUT_DIR}/desktop-${theme}-home-with-items.png`, fullPage: true })
    console.log(`  ✓ desktop-${theme}-home-with-items.png`)
  }
  await page.close()

  // 移动
  const mpage = await browser.newPage()
  await mpage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })

  for (const theme of THEMES) {
    console.log(`[mobile] ${theme}...`)
    await mpage.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' })
    await mpage.evaluate((t) => {
      localStorage.setItem('llhw-theme', t)
      localStorage.setItem('linli_haowu_pos_v1', JSON.stringify({ lat: 30.2741, lng: 120.1551 }))
      document.documentElement.dataset.theme = t
    }, theme)
    await mpage.reload({ waitUntil: 'domcontentloaded' })
    await sleep(800)
    await mpage.screenshot({ path: `${OUT_DIR}/mobile-${theme}-home-with-items.png`, fullPage: true })
    console.log(`  ✓ mobile-${theme}-home-with-items.png`)
  }
  await mpage.close()

  await browser.close()
  console.log('\n✅ 聚焦截图完成')
}

main().catch((e) => { console.error(e); process.exit(1) })
