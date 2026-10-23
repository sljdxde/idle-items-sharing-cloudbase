#!/usr/bin/env node
// ================================================
// scripts/version.mjs — 版本号读写、发版与 Release
//
//   node scripts/version.mjs status                       # 看当前状态
//   node scripts/version.mjs set 2.2.0-1.0-snapshot       # 开发期
//   node scripts/version.mjs set 2.2.0-1.0                # 提测
//   node scripts/version.mjs release 2.2.0                # 发布：改号+说明+提交+tag+推送+Release
//   node scripts/version.mjs release 2.2.0 --dry-run      # 只看不动
//   node scripts/version.mjs release 2.2.0 --no-publish   # 只做本地（不推送/不建 Release）
//   node scripts/version.mjs publish v2.1.1               # 补建/刷新某个 tag 的 GitHub Release
//   node scripts/version.mjs doctor                       # 审计：哪些 tag 还没有 Release
//
// 发布是三件套，缺一不可：版本号 → tag → GitHub Release（带说明）。
// 说明由 scripts/lib/releaseNotes.mjs 按提交前缀自动生成，落到 docs/releases/vX.Y.Z.md。
// ================================================

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_BRANCH,
  classifyVersion,
  compareCore,
  isReleaseVersion,
} from './lib/versionPolicy.mjs'
import { buildReleaseNotes } from './lib/releaseNotes.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PKG = resolve(ROOT, 'package.json')
const LOCK = resolve(ROOT, 'package-lock.json')
const RELEASE_DIR = resolve(ROOT, 'docs/releases')

const KIND_LABEL = {
  release: '发布版',
  test: '提测版',
  snapshot: '开发快照',
  invalid: '不合规',
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function gh(args) {
  return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8' }).trim()
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
function applyVersion(version, dryRun = false) {
  if (dryRun) return
  const pkg = readJson(PKG)
  pkg.version = version
  writeJson(PKG, pkg)

  const lock = readJson(LOCK)
  lock.version = version
  if (lock.packages?.['']) lock.packages[''].version = version
  writeJson(LOCK, lock)
}

/** 该提交之前最近的发布 tag（发布说明的对比基线） */
function previousTag(rev = 'HEAD') {
  const patterns = [`${rev}^`, rev]
  for (const ref of patterns) {
    try {
      return git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', ref])
    } catch {
      /* 试下一个 */
    }
  }
  return ''
}

function subjectsBetween(fromTag, rev = 'HEAD') {
  const range = fromTag ? `${fromTag}..${rev}` : rev
  const out = git(['log', '--format=%s', range])
  return out ? out.split('\n').filter(Boolean) : []
}

function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 生成说明文本（不落盘） */
function renderNotes(version, rev = 'HEAD') {
  const prev = previousTag(rev)
  return {
    previousTag: prev,
    text: buildReleaseNotes({
      version,
      subjects: subjectsBetween(prev, rev),
      previousTag: prev,
      date: today(),
    }),
  }
}

function releaseExists(tagName) {
  try {
    // 音量关掉：gh 查不到时会往 stderr 打 "release not found"，那是预期分支不是错误
    execFileSync('gh', ['release', 'view', tagName, '--json', 'tagName'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

function ensureGh() {
  try {
    gh(['--version'])
  } catch {
    console.error('✖ 找不到 gh（GitHub CLI），无法创建 Release。装好后重试，或加 --no-publish。')
    process.exit(1)
  }
}

function cmdStatus() {
  const pkg = readJson(PKG)
  const lock = readJson(LOCK)
  const kind = classifyVersion(pkg.version)
  const branch = currentBranch() || '(detached)'
  const lockOk = lock.version === pkg.version && lock.packages?.['']?.version === pkg.version

  let tagAtHead = ''
  try {
    tagAtHead = git(['tag', '--points-at', 'HEAD']).split('\n').filter(Boolean).join(', ')
  } catch {
    tagAtHead = ''
  }

  const tagName = `v${pkg.version}`
  console.log(`分支            ${branch}`)
  console.log(`版本            ${pkg.version}  (${KIND_LABEL[kind]})`)
  console.log(`lock 同步       ${lockOk ? '是' : '否 —— 跑 \`npm run version:set\` 同步'}`)
  console.log(`HEAD 上的 tag   ${tagAtHead || '(无)'}`)
  if (kind === 'release') {
    const has = releaseExists(tagName)
    console.log(`对应 Release    ${has ? '已存在' : `缺失 —— 跑 \`npm run version:publish -- ${tagName}\``}`)
  }
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

function cmdRelease(rawVersion, { dryRun, allowBranch, publish }) {
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
  if (before === version) {
    console.error(`✖ 版本号已经是 ${version}，无需重复发版。`)
    process.exit(1)
  }

  const tagName = `v${version}`
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`])
    console.error(`✖ tag ${tagName} 已存在。发布过的 tag 不改写，请换新版本号。`)
    process.exit(1)
  } catch {
    /* 不存在，继续 */
  }

  const notes = renderNotes(version)
  const notesFile = join(RELEASE_DIR, `v${version}.md`)

  if (dryRun) {
    console.log(`[dry-run] 版本 ${before} → ${version}`)
    console.log(`[dry-run] 说明将写入 docs/releases/v${version}.md，内容预览：\n`)
    console.log(notes.text)
    console.log(
      `[dry-run] 将执行：git commit / git tag ${tagName}` +
        (publish ? ' / push master 与 tag / gh release create' : ''),
    )
    return
  }

  if (publish) ensureGh()

  applyVersion(version)
  writeFileSync(notesFile, notes.text, 'utf8')

  git(['add', 'package.json', 'package-lock.json', `docs/releases/v${version}.md`])
  git(['commit', '-m', `chore(release): ${version}`])
  git(['tag', '-a', tagName, '-m', `v${version} — 发布说明见 docs/releases/v${version}.md`])

  console.log(`✔ 版本 ${before} → ${version}，已提交并打 tag ${tagName}`)
  console.log(`✔ 发布说明已写入 docs/releases/v${version}.md`)

  if (!publish) {
    console.log('\n已跳过推送与 Release（--no-publish）。补齐三件套：')
    console.log(`  git push origin ${RELEASE_BRANCH} && git push origin ${tagName}`)
    console.log(`  node scripts/version.mjs publish ${tagName}`)
    return
  }

  console.log(`\n推送 ${RELEASE_BRANCH} 与 ${tagName} ...`)
  git(['push', 'origin', RELEASE_BRANCH])
  git(['push', 'origin', tagName])

  console.log('创建 GitHub Release ...')
  gh([
    'release',
    'create',
    tagName,
    '--title',
    tagName,
    '--notes-file',
    `docs/releases/v${version}.md`,
    '--latest',
  ])

  console.log(`\n✔ 发布完成：${tagName}`)
  console.log('  版本号 / tag / GitHub Release 三件套齐了。')
  console.log('  主站还没更新的话：npm run deploy:pages')
}

function cmdPublish(rawTag, notesFileArg) {
  const tagName = String(rawTag || '').trim()
  if (!/^v\d+\.\d+\.\d+$/.test(tagName)) {
    console.error(`✖ 只接受发布 tag（vX.Y.Z），收到 "${tagName}"。`)
    process.exit(1)
  }
  ensureGh()

  const version = tagName.slice(1)

  // tag 必须已在远端：GitHub Release 依附于已推送的 tag
  let remoteTag = ''
  try {
    remoteTag = git(['ls-remote', '--tags', 'origin', `refs/tags/${tagName}`])
  } catch {
    remoteTag = ''
  }
  if (!remoteTag) {
    console.error(`✖ 远端还没有 tag ${tagName}，先推送：git push origin ${tagName}`)
    process.exit(1)
  }

  let notesFile = notesFileArg
  let tmpFile = ''
  if (notesFile) {
    if (!existsSync(resolve(ROOT, notesFile))) {
      console.error(`✖ 找不到说明文件 ${notesFile}`)
      process.exit(1)
    }
  } else {
    const notes = renderNotes(version, tagName)
    tmpFile = join(tmpdir(), `release-notes-${tagName}.md`)
    writeFileSync(tmpFile, notes.text, 'utf8')
    notesFile = tmpFile
    console.log(`（说明由 ${notes.previousTag || '仓库起点'}..${tagName} 的提交生成）`)
  }

  if (releaseExists(tagName)) {
    gh(['release', 'edit', tagName, '--notes-file', notesFile, '--title', tagName, '--latest'])
    console.log(`✔ 已更新 ${tagName} 的 Release 说明`)
  } else {
    gh(['release', 'create', tagName, '--title', tagName, '--notes-file', notesFile, '--latest'])
    console.log(`✔ 已创建 ${tagName} 的 Release`)
  }
  if (tmpFile) console.log(`  （临时说明：${tmpFile}）`)
}

function cmdDoctor(strict) {
  ensureGh()
  const tags = git(['tag', '-l', 'v[0-9]*', '--sort=-v:refname'])
    .split('\n')
    .filter(Boolean)

  if (!tags.length) {
    console.log('没有发布 tag。')
    return
  }

  const missing = []
  for (const tag of tags) {
    const ok = releaseExists(tag)
    console.log(`${ok ? '✔' : '✖'} ${tag.padEnd(10)} ${ok ? 'Release 已存在' : 'Release 缺失'}`)
    if (!ok) missing.push(tag)
  }

  if (missing.length) {
    console.log(`\n共 ${missing.length} 个 tag 缺少 Release：`)
    for (const tag of missing) console.log(`  npm run version:publish -- ${tag}`)
    if (strict) process.exit(1)
  } else {
    console.log('\n全部 tag 都有 Release。')
  }
}

const args = process.argv.slice(2)
const cmd = args[0]
const positional = args.slice(1).filter((a) => !a.startsWith('--'))
const flags = new Set(args.filter((a) => a.startsWith('--')))

if (cmd === 'status') cmdStatus()
else if (cmd === 'set') cmdSet(positional[0], flags.has('--dry-run'))
else if (cmd === 'release') {
  cmdRelease(positional[0], {
    dryRun: flags.has('--dry-run'),
    allowBranch: flags.has('--allow-branch'),
    publish: !flags.has('--no-publish'),
  })
} else if (cmd === 'publish') {
  const notesIdx = args.indexOf('--notes-file')
  cmdPublish(positional[0], notesIdx > -1 ? args[notesIdx + 1] : '')
} else if (cmd === 'doctor') cmdDoctor(flags.has('--strict'))
else {
  console.error(
    '用法：\n' +
      '  node scripts/version.mjs status\n' +
      '  node scripts/version.mjs set <版本号> [--dry-run]\n' +
      '  node scripts/version.mjs release <x.y.z> [--dry-run] [--no-publish] [--allow-branch]\n' +
      '  node scripts/version.mjs publish vX.Y.Z [--notes-file <path>]\n' +
      '  node scripts/version.mjs doctor [--strict]',
  )
  process.exit(2)
}
