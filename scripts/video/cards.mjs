// ================================================
// scripts/video/cards.mjs — 渲染文字卡片与字幕条 PNG
// 用本机 Chrome 截图 cards.html 的各区块（1080x2340 / 1080x220）
// 用法：node scripts/video/cards.mjs
// ================================================

import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CARDS = path.join(__dirname, 'cards')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

mkdirSync(CARDS, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--lang=zh-CN'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1080, height: 2340, deviceScaleFactor: 1 })
await page.goto('file://' + path.join(__dirname, 'cards.html'))
await page.evaluate(() => document.fonts.ready)

for (const id of ['title', 'bg', 'feat', 'ops', 'end']) {
  const el = await page.$('#' + id)
  await el.screenshot({ path: path.join(CARDS, `${id}.png`) })
  console.log('card:', id)
}
for (let i = 1; i <= 8; i++) {
  const id = 'cap0' + i
  const el = await page.$('#' + id)
  await el.screenshot({ path: path.join(CARDS, `${id}.png`), omitBackground: true })
  console.log('cap:', id)
}

await browser.close()
console.log('done → cards/')
