#!/usr/bin/env node
// ================================================
// scripts/check-version.mjs — git 钩子的版本校验入口
//
// 用法（由 .githooks/ 调用，一般不用手跑）：
//   node scripts/check-version.mjs pre-commit
//   node scripts/check-version.mjs pre-push      # 从 stdin 读 refs
//
// 两道门：
//   pre-commit —— 版本形态合法 + 分支匹配（master 只允许 x.y.z）+ lock 同步
//   pre-push   —— 推 master 必须是 x.y.z；推 tag 必须是 vX.Y.Z 且等于 package.json
//
// 规则细节见 scripts/lib/versionPolicy.mjs 与 AGENTS.md「版本与发布」。
// ================================================

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_BRANCH,
  checkLockSync,
  checkReleaseTagName,
  checkTagAgainstPackage,
  checkVersionForBranch,
} from './lib/versionPolicy.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

/** rev 为空读工作区，否则读该提交 */
function readJson(rev, file) {
  const raw = rev ? git(['show', `${rev}:${file}`]) : readFileSync(resolve(ROOT, file), 'utf8')
  return JSON.parse(raw)
}

function currentBranch() {
  try {
    return git(['symbolic-ref', '--short', '-q', 'HEAD'])
  } catch {
    return '' // detached HEAD（rebase / cherry-pick 中途），不按 master 处理
  }
}

function fail(headline, detail) {
  console.error(`\n\u2716 版本规范校验未通过：${headline}`)
  if (detail) console.error(`\n${detail}`)
  const line = '-'.repeat(64)
  console.error(`\n${line}`)
  console.error('规则见 AGENTS.md「版本与发布」。确需绕过必须先跟老大确认，')
  console.error('不要用 --no-verify 硬闯（绕过等于没有规则）。')
  console.error(`${line}\n`)
  process.exit(1)
}

/** 版本形态 + lock 同步，两处都过才放行 */
function assertVersion(version, lock, branch) {
  const byBranch = checkVersionForBranch(version, branch)
  if (!byBranch.ok) fail(`package.json 版本号不合规（分支 ${branch || 'detached'}）`, byBranch.message)

  const synced = checkLockSync(version, lock.version, lock.packages?.['']?.version)
  if (!synced.ok) fail('package-lock.json 版本漂移', synced.message)
}

function runPreCommit() {
  const pkg = readJson(null, 'package.json')
  const lock = readJson(null, 'package-lock.json')
  const branch = currentBranch()
  assertVersion(pkg.version, lock, branch)
  console.log(`\u2714 版本规范校验通过：${pkg.version}（分支 ${branch || 'detached'}）`)
}

function runPrePush() {
  const stdin = readFileSync(0, 'utf8').trim()
  if (!stdin) {
    console.log('\u2714 无 ref 需要推送，跳过版本校验')
    return
  }

  for (const line of stdin.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [localRef, localSha, remoteRef] = line.split(/\s+/)
    if (!localRef || !localSha) continue

    // 1) 推 tag：只能是 vX.Y.Z，且必须等于该提交的 package.json
    if (localRef.startsWith('refs/tags/')) {
      const tagName = localRef.slice('refs/tags/'.length)
      const byName = checkReleaseTagName(tagName)
      if (!byName.ok) fail(`tag ${tagName} 命名不合规`, byName.message)

      if (byName.version) {
        const pkg = readJson(localSha, 'package.json')
        const byPkg = checkTagAgainstPackage(tagName, pkg.version)
        if (!byPkg.ok) fail(`tag ${tagName} 与版本号不一致`, byPkg.message)
      }
      console.log(`\u2714 tag ${tagName} 校验通过`)
      continue
    }

    // 2) 推 master：必须是发布版本
    if (remoteRef === `refs/heads/${RELEASE_BRANCH}`) {
      const pkg = readJson(localSha, 'package.json')
      const lock = readJson(localSha, 'package-lock.json')
      assertVersion(pkg.version, lock, RELEASE_BRANCH)
      console.log(`\u2714 推送 ${RELEASE_BRANCH} 校验通过：${pkg.version}`)
    }
  }
}

const mode = process.argv[2]
if (mode === 'pre-commit') runPreCommit()
else if (mode === 'pre-push') runPrePush()
else {
  console.error('用法：node scripts/check-version.mjs <pre-commit|pre-push>')
  process.exit(2)
}
