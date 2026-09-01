// ================================================
// scripts/video/shots.mjs — 产品介绍视频素材截图
// 用本机 Chrome 驱动真实线上站点（linli-haowu.pages.dev）
// 输出竖屏 1080x2340 截图到 scripts/video/frames/
// 用法：node scripts/video/shots.mjs
// ================================================

import puppeteer from 'puppeteer-core'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRAMES = path.join(__dirname, 'frames')
const BASE = 'https://linli-haowu.pages.dev'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const USER = '13911112222'

rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  await page.screenshot({ path: path.join(FRAMES, `${name}.png`) })
  console.log('shot:', name)
}

async function goto(page, hash, settle = 1600) {
  await page.evaluate((h) => { location.hash = h }, hash)
  await sleep(settle)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--lang=zh-CN'],
})
const page = await browser.newPage()
await page.setViewport({ width: 432, height: 936, deviceScaleFactor: 2.5 })

// ── 01 首页（未登录）：英雄区 + 筛选 + 列表 ──
await page.goto(BASE + '/#/', { waitUntil: 'networkidle2' })
await page.waitForSelector('.item-card, a[href^="#/items/"]', { timeout: 15000 })
await sleep(1200)
await shot(page, '01-home-anon')

// ── 02 登录校验：发布页未登录 → 输入非法手机号 → 错误提示 ──
await goto(page, '#/publish')
await page.waitForSelector('form.login-box', { timeout: 10000 })
await page.type('form.login-box input', '12012345678')
await page.evaluate(() => {
  document.querySelector('form.login-box').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  )
})
await page.waitForSelector('.login-error', { timeout: 5000 })
await sleep(400)
await shot(page, '02-login-error')

// ── 03 登录成功 → 首页出现「我的发布 / 我的借用」入口 ──
await page.evaluate((sel, v) => {
  const input = document.querySelector(sel)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}, 'form.login-box input', USER)
await page.evaluate(() => {
  document.querySelector('form.login-box').dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  )
})
await page.waitForSelector('form.publish-form', { timeout: 10000 })
await goto(page, '#/')
await page.waitForSelector('.memphis-mypanel', { timeout: 10000 })
await sleep(800)
await shot(page, '03-home-loggedin')

// ── 04 首页下滑：好物列表 ──
await page.evaluate(() => window.scrollTo({ top: 560, behavior: 'instant' }))
await sleep(600)
await shot(page, '04-home-list')

// ── 05 发布表单：照片上传区（美化后的按钮）──
await goto(page, '#/publish')
await page.waitForSelector('form.publish-form', { timeout: 10000 })
await page.evaluate(() => {
  document.querySelector('.btn-photo')?.scrollIntoView({ block: 'center' })
})
await sleep(600)
await shot(page, '05-publish-photo')

// ── 06 物品详情：带定位 → 「所在位置」逆地理编码 ──
await goto(page, '#/items/73', 2500)
await page.waitForFunction(
  () => document.body.innerText.includes('所在位置'),
  { timeout: 15000 },
).catch(() => console.warn('warn: 地址行未出现（逆地理超时）'))
await sleep(500)
await shot(page, '06-detail-address')

// ── 07 借用一件邻居好物（73 是自己的不行，借 65）→ 我的借用页 ──
await page.evaluate(async (u) => {
  await fetch('/api/items/65/borrow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-site-key': 'neighborhood-share-2026' },
    body: JSON.stringify({ operatorPhone: u }),
  })
}, USER)
await goto(page, '#/borrows')
await page.waitForSelector('.borrow-main', { timeout: 10000 })
await sleep(800)
await shot(page, '07-borrows')

// ── 08 归还，恢复数据 ──
await page.evaluate(async (u) => {
  await fetch('/api/items/65/return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-site-key': 'neighborhood-share-2026' },
    body: JSON.stringify({ operatorPhone: u }),
  })
}, USER)

// ── 09 我的发布：上架 / 下架 / 删除 ──
await goto(page, '#/mine')
await page.waitForSelector('.mine-main', { timeout: 10000 })
await sleep(800)
await shot(page, '08-mine')

await browser.close()
console.log('done → frames/')
