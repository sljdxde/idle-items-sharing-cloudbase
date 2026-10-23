#!/usr/bin/env node
// ================================================
// scripts/version.mjs — 版本号读写与发版
//
//   node scripts/version.mjs status                              # 看当前状态
//   node scripts/version.mjs set 2.2.0-1.0-snapshot              # 开发期
//   node scripts/version.mjs set 2.2.0-1.0                       # 提测
//   node scripts/version.mjs release 2.2.0                       # 发布：改号 + 提交 + 打 tag
//   node scripts/version.mjs release 2.2.0 --dry-run             # 只看不动
//
// set 只改文件（package.json + package-lock.json 两处），不提交；
// release 会改号、git commit、打 annotated tag vX.Y.Z，然后提示推送命令。
// ================================================

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_BRANCH,
  classifyVersion,
  compareCore,
  isReleaseVersion,
} from './lib/versionPolicy.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = resolve(ROOT, 'package.json')
const LOCK = resolve(ROOT, 'package-lock.json')

const KIND_LABEL = {
  release: '发布版',
  test: '提测版',
  snapshot: '开发快照',
  invalid: '不合规',
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function currentBranch() {
  try {
    return git(['symbolic-ref', '--short', '-q', 'HEAD'])
  } catch {
    return ''
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

/** 同步写入 package.json 与 package-lock.json（顶层 + packages[""]） */
function applyVersion(version, dryRun) {
  const pkg = readJson(PKG)
  const lock = readJson(LOCK)

  if (!dryRun) {
    pkg.version = version
    writeJson(PKG, pkg)

    lock.version = version
    if (lock.packages?.['']) lock.packages[''].version = version
    writeJson(LOCK, lock)
  }
  return { pkg, lock }
}

function cmdStatus() {
  const pkg = readJson(PKG)
  const lock = readJson(LOCK)
  const kind = classifyVersion(pkg.version)
  const branch = currentBranch() || '(detached)'
  const lockOk =
    lock.version === pkg.version && lock.packages?.['']?.version === pkg.version

  let tagAtHead = ''
  try {
    tagAtHead = git(['tag', '--points-at', 'HEAD']).split('\n').filter(Boolean).join(', ')
  } catch {
    tagAtHead = ''
  }

  console.log(`分支          ${branch}`)
  console.log(`版本          ${pkg.version}  (${KIND_LABEL[kind]})`)
  console.log(`lock 同步     ${lockOk ? '是' : '否 —— 跑 `npm run version:set` 同步'}`)
  console.log(`HEAD 上的 tag ${tagAtHead || '(无)'}`)
  if (branch === RELEASE_BRANCH && kind !== 'release') {
    console.log(`\n⚠ ${RELEASE_BRANCH} 上只允许发布版本，当前是${KIND_LABEL[kind]}，提交会被钩子拦下。`)
  }
}

function cmdSet(rawVersion, dryRun) {
  const version = String(rawVersion || '').trim()
  const kind = classifyVersion(version)
  if (kind === 'invalid') {
    console.error(
      `✖ 版本号 "${version}" 不合规。合法形态：\n` +
        '  开发  x.y.z-a.b-snapshot  （例 2.2.0-1.0-snapshot）\n' +
        '  提测  x.y.z-a.b           （例 2.2.0-1.0）\n' +
        '  发布  x.y.z               （例 2.2.0）',
    )
    process.exit(1)
  }

  const before = readJson(PKG).version
  applyVersion(version, dryRun)
  console.log(`${dryRun ? '[dry-run] ' : ''}版本 ${before} → ${version}（${KIND_LABEL[kind]}）`)
  if (!dryRun) console.log('package.json 与 package-lock.json 已同步，记得重新构建再验证页脚版本。')
}

function cmdRelease(rawVersion, { dryRun, allowBranch }) {
  const version = String(rawVersion || '').trim()
  if (!isReleaseVersion(version)) {
    console.error(
      `✖ 发布只允许 x.y.z（例如 2.2.0），收到 "${version}"。\n` +
        '  提测/开发版本请用 `npm run version:set -- 2.2.0-1.0` 之类，不要走 release。',
    )
    process.exit(1)
  }

  const branch = currentBranch()
  if (branch !== RELEASE_BRANCH && !allowBranch) {
    console.error(
      `✖ 发版要在 ${RELEASE_BRANCH} 上做，当前在 ${branch || '(detached)'}。\n` +
        '  先合并到 master；确实要在其它分支打版请加 --allow-branch。',
    )
    process.exit(1)
  }

  const before = readJson(PKG).version
  const cmp = compareCore(version, before)
  if (!Number.isNaN(cmp) && cmp < 0) {
    console.error(`✖ 新版本 ${version} 小于当前 ${before}，不能回退版本号。`)
    process.exit(1)
  }
  if (cmp === 0 && before === version) {
    console.error(`✖ 版本号已经是 ${version}，无需重复发版。`)
    process.exit(1)
  }

  const tagName = `v${version}`
  let tagExists = false
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`])
    tagExists = true
  } catch {
    tagExists = false
  }
  if (tagExists) {
    console.error(`✖ tag ${tagName} 已存在。发布过的 tag 不改写，请换新版本号。`)
    process.exit(1)
  }

  applyVersion(version, dryRun)
  console.log(`${dryRun ? '[dry-run] ' : ''}版本 ${before} → ${version}`)

  if (dryRun) {
    console.log('[dry-run] 将执行：git commit -m "chore(release): ' + version + '" && git tag -a ' + tagName)
    return
  }

  git(['add', 'package.json', 'package-lock.json'])
  git(['commit', '-m', `chore(release): ${version}`])
  git(['tag', '-a', tagName, '-m', `${tagName} — 发布版本`])

  console.log(`\n✔ 已提交并打 tag ${tagName}`)
  console.log('下一步（两条都要）：')
  console.log(`  git push origin ${RELEASE_BRANCH}`)
  console.log(`  git push origin ${tagName}`)
  console.log('推完记得重新部署主站：npm run deploy:pages')
}

const args = process.argv.slice(2)
const cmd = args[0]
const positional = args.slice(1).filter((a) => !a.startsWith('--'))
const flags = new Set(args.filter((a) => a.startsWith('--')))

if (cmd === 'status') cmdStatus()
else if (cmd === 'set') cmdSet(positional[0], flags.has('--dry-run'))
else if (cmd === 'release') {
  cmdRelease(positional[0], { dryRun: flags.has('--dry-run'), allowBranch: flags.has('--allow-branch') })
} else {
  console.error(
    '用法：\n' +
      '  node scripts/version.mjs status\n' +
      '  node scripts/version.mjs set <版本号> [--dry-run]\n' +
      '  node scripts/version.mjs release <x.y.z> [--dry-run] [--allow-branch]',
  )
  process.exit(2)
}
