// ================================================
// scripts/lib/versionPolicy.mjs — 版本号形态与使用场景的单一真相源
//
// 规则（老大 2026-10-23 定）：
//   日常开发  x.y.z-a.b-snapshot   例 2.2.0-1.0-snapshot
//   提测      x.y.z-a.b            例 2.2.0-1.0
//   发布      x.y.z                例 2.2.0
//
// 只允许这三种形态；master 上只允许发布形态；发布 tag 只允许 vX.Y.Z。
// 这里只做纯判断（返回 {ok, message}），不读文件、不调 git —— 便于单测。
// ================================================

/** 发布版：2.1.1 */
const RELEASE_RE = /^(\d+)\.(\d+)\.(\d+)$/
/** 提测版：2.2.0-1.0（a、b 必须是数字） */
const TEST_RE = /^(\d+)\.(\d+)\.(\d+)-(\d+)\.(\d+)$/
/** 开发快照：2.2.0-1.0-snapshot */
const SNAPSHOT_RE = /^(\d+)\.(\d+)\.(\d+)-(\d+)\.(\d+)-snapshot$/
/** 发布 tag：v2.2.0（不带后缀） */
const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/

/** 主分支名；master 上只允许发布形态 */
export const RELEASE_BRANCH = 'master'

/**
 * 判定版本形态。
 * @param {string} version
 * @returns {'release'|'test'|'snapshot'|'invalid'}
 */
export function classifyVersion(version) {
  const v = String(version ?? '').trim()
  if (RELEASE_RE.test(v)) return 'release'
  if (TEST_RE.test(v)) return 'test'
  if (SNAPSHOT_RE.test(v)) return 'snapshot'
  return 'invalid'
}

/** 是否发布形态（x.y.z） */
export function isReleaseVersion(version) {
  return classifyVersion(version) === 'release'
}

const FORM_HINT =
  '合法形态只有三种：开发 `x.y.z-a.b-snapshot`、提测 `x.y.z-a.b`、发布 `x.y.z`（a、b 必须是数字）'

/**
 * 分支与版本形态是否匹配。
 * master 只允许发布形态；其它分支三种都允许。
 * @param {string} version
 * @param {string} branch
 */
export function checkVersionForBranch(version, branch) {
  const kind = classifyVersion(version)
  if (kind === 'invalid') {
    return { ok: false, message: `版本号 "${version}" 不符合规范。${FORM_HINT}` }
  }
  if (branch === RELEASE_BRANCH && kind !== 'release') {
    return {
      ok: false,
      message:
        `${RELEASE_BRANCH} 上只允许发布版本 x.y.z，当前是 "${version}"（${kind}）。\n` +
        '发布前请先跑 `npm run version:release -- <x.y.z>`，把版本收敛成纯发布号。',
    }
  }
  return { ok: true, message: '' }
}

/**
 * 发布 tag 名是否合规：只接受 vX.Y.Z。
 * 非 v 开头的 tag（如备份用）不在此规则内，直接放行。
 * @param {string} tagName
 */
export function checkReleaseTagName(tagName) {
  const t = String(tagName ?? '').trim()
  if (!t.startsWith('v')) return { ok: true, message: '' }
  const m = TAG_RE.exec(t)
  if (!m) {
    return {
      ok: false,
      message:
        `tag "${t}" 不合规：发布 tag 只能是 vX.Y.Z（例如 v2.2.0），` +
        '不能带 -a.b 或 -snapshot 后缀。',
    }
  }
  return { ok: true, message: '', version: `${m[1]}.${m[2]}.${m[3]}` }
}

/**
 * tag 与 package.json 版本是否一致。
 * @param {string} tagName
 * @param {string} pkgVersion
 */
export function checkTagAgainstPackage(tagName, pkgVersion) {
  const tagCheck = checkReleaseTagName(tagName)
  if (!tagCheck.ok) return tagCheck
  if (!tagCheck.version) return { ok: true, message: '' } // 非发布 tag，跳过
  if (tagCheck.version !== String(pkgVersion ?? '').trim()) {
    return {
      ok: false,
      message:
        `tag "${tagName}" 对应版本 ${tagCheck.version}，但该提交的 package.json 是 ` +
        `"${pkgVersion}"。发布 tag 必须与 package.json 完全一致。`,
    }
  }
  return { ok: true, message: '' }
}

/**
 * package-lock.json 的版本字段是否与 package.json 同步。
 * 历史上漂移过（package.json 2.1.0 / lock 2.0.0），所以单独守一道。
 * @param {string} pkgVersion
 * @param {string} lockTopVersion
 * @param {string} lockRootVersion packages[""].version
 */
export function checkLockSync(pkgVersion, lockTopVersion, lockRootVersion) {
  const pkg = String(pkgVersion ?? '').trim()
  const bad = []
  if (String(lockTopVersion ?? '').trim() !== pkg) bad.push(`顶层 version=${lockTopVersion}`)
  if (String(lockRootVersion ?? '').trim() !== pkg) {
    bad.push(`packages[""].version=${lockRootVersion}`)
  }
  if (bad.length) {
    return {
      ok: false,
      message:
        `package-lock.json 与 package.json 版本不一致（package.json=${pkg}，${bad.join('，')}）。\n` +
        '跑 `npm run version:set -- <版本号>` 会自动同步两处。',
    }
  }
  return { ok: true, message: '' }
}

/**
 * 数值比较两个版本的 x.y.z 主体（忽略后缀）。
 * @returns {number} a>b 返回 1，相等 0，小于 -1；无法解析返回 NaN
 */
export function compareCore(a, b) {
  const pick = (v) => String(v ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  const ma = pick(a)
  const mb = pick(b)
  if (!ma || !mb) return NaN
  for (let i = 1; i <= 3; i++) {
    const x = Number(ma[i])
    const y = Number(mb[i])
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}
