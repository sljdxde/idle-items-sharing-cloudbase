// ================================================
// scripts/fix-dist-html.mjs — 产物后处理：去除 type="module"/crossorigin
// 容器 CSP 要求经典脚本（zip-artifact-spec.md §3）；
// 构建产物本身已是 IIFE，仅入口标签属性需修正。
// 用法：node scripts/fix-dist-html.mjs [distDir]
// ================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const file = join(dist, 'index.html')
let html = readFileSync(file, 'utf8')

const before = html
// type="module" 默认延迟执行；换成经典脚本后必须补 defer，
// 否则 head 内阻塞执行时 #app 尚未解析、挂载失败。
html = html.replace(/<script([^>]*)\stype="module"([^>]*)>/g, '<script$1$2 defer>')
html = html.replace(/<script([^>]*)\scrossorigin(?:="[^"]*")?([^>]*)>/g, '<script$1$2>')

if (html === before) {
  console.log('fix-dist-html: 无需修改（已合规）')
} else {
  writeFileSync(file, html)
  console.log('fix-dist-html: 已移除 type="module"/crossorigin')
}

// 硬校验：不合规即失败，阻断打包
if (/type=["']module["']/.test(html)) {
  console.error('FAIL: index.html 仍含 type="module"')
  process.exit(1)
}
console.log('fix-dist-html: 校验通过 —— 入口为经典脚本')
