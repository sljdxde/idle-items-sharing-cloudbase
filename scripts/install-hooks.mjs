#!/usr/bin/env node
// ================================================
// scripts/install-hooks.mjs — 把 .githooks 挂成 repo 的 hooks 目录
//
// 由 package.json 的 `prepare` 自动触发（npm install / npm ci 之后），
// 也可以手动跑：node scripts/install-hooks.mjs
//
// 为什么用 core.hooksPath 而不是 husky：
//   - 零依赖，不需要额外的 node_modules；
//   - 钩子脚本随仓库走，clone 下来 `npm install` 一次就生效。
// ================================================

import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOOK_DIR = resolve(ROOT, '.githooks')
const HOOKS = ['pre-commit', 'pre-push']

function run(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function main() {
  // 非 git 环境（npm pack、部分 CI 缓存场景）静默跳过，别把 install 弄挂
  if (!existsSync(resolve(ROOT, '.git'))) {
    console.log('[hooks] 不在 git 仓库内，跳过钩子安装')
    return
  }
  if (!existsSync(HOOK_DIR)) {
    console.log('[hooks] 未找到 .githooks/，跳过')
    return
  }

  for (const hook of HOOKS) {
    const file = resolve(HOOK_DIR, hook)
    if (existsSync(file)) chmodSync(file, 0o755)
  }

  const current = (() => {
    try {
      return run(['config', '--get', 'core.hooksPath'])
    } catch {
      return ''
    }
  })()

  if (current === '.githooks') {
    console.log('[hooks] core.hooksPath 已是 .githooks，无需变更')
    return
  }

  run(['config', 'core.hooksPath', '.githooks'])
  console.log('[hooks] 已设置 core.hooksPath = .githooks（版本规范校验已生效）')
}

try {
  main()
} catch (err) {
  // 自动安装失败不该阻断 npm install，但要把原因说清楚
  console.warn(`[hooks] 安装失败：${err?.message ?? err}`)
  console.warn('[hooks] 手动执行：node scripts/install-hooks.mjs')
  process.exit(0)
}
