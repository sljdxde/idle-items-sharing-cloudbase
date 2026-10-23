// ================================================
// tests/version-policy.test.ts — 版本号规范（AGENTS.md「版本与发布」）的契约
//
// 这条规则以前只靠人记：package.json 2.1.0 而 package-lock 还停在 2.0.0，
// v2.1.0 tag 也停在几个版本之前的提交上。现在由 .githooks + 本文件的断言共同守住。
// ================================================

import { describe, expect, it } from 'vitest'
import {
  checkLockSync,
  checkReleaseTagName,
  checkTagAgainstPackage,
  checkVersionForBranch,
  classifyVersion,
  compareCore,
  isReleaseVersion,
} from '../scripts/lib/versionPolicy.mjs'

describe('classifyVersion', () => {
  it('识别三种合法形态', () => {
    expect(classifyVersion('2.2.0')).toBe('release')
    expect(classifyVersion('2.2.0-1.0')).toBe('test')
    expect(classifyVersion('2.2.0-1.0-snapshot')).toBe('snapshot')
  })

  it('拒绝缺段、多段、带前缀的版本号', () => {
    for (const bad of ['2.2', '2', '2.2.0.1', 'v2.2.0', '', '  ', 'latest']) {
      expect(classifyVersion(bad)).toBe('invalid')
    }
  })

  it('a.b 必须是数字，字母后缀不被接受', () => {
    expect(classifyVersion('2.2.0-beta.1')).toBe('invalid')
    expect(classifyVersion('2.2.0-1.x')).toBe('invalid')
  })

  it('snapshot 后缀必须是小写且紧跟在 a.b 后', () => {
    expect(classifyVersion('2.2.0-1.0-SNAPSHOT')).toBe('invalid')
    expect(classifyVersion('2.2.0-snapshot')).toBe('invalid')
  })

  it('isReleaseVersion 只认纯净版', () => {
    expect(isReleaseVersion('2.2.0')).toBe(true)
    expect(isReleaseVersion('2.2.0-1.0')).toBe(false)
    expect(isReleaseVersion('2.2.0-1.0-snapshot')).toBe(false)
  })
})

describe('checkVersionForBranch', () => {
  it('master 只接受 x.y.z', () => {
    expect(checkVersionForBranch('2.2.0', 'master').ok).toBe(true)
    expect(checkVersionForBranch('2.2.0-1.0', 'master').ok).toBe(false)
    expect(checkVersionForBranch('2.2.0-1.0-snapshot', 'master').ok).toBe(false)
  })

  it('其它分支三种形态都放行', () => {
    for (const v of ['2.2.0', '2.2.0-1.0', '2.2.0-1.0-snapshot']) {
      expect(checkVersionForBranch(v, 'feat/x').ok).toBe(true)
    }
  })

  it('非法版本号在任何分支都被拒绝', () => {
    expect(checkVersionForBranch('2.2', 'feat/x').ok).toBe(false)
  })

  it('拒绝 master 时报错信息要说清怎么办', () => {
    const r = checkVersionForBranch('2.2.0-1.0-snapshot', 'master')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('master')
    expect(r.message).toContain('version:release')
  })
})

describe('checkReleaseTagName', () => {
  it('接受 vX.Y.Z 并解析出版本', () => {
    const r = checkReleaseTagName('v2.2.0')
    expect(r.ok).toBe(true)
    expect(r.version).toBe('2.2.0')
  })

  it('拒绝带提测/快照后缀的 tag', () => {
    expect(checkReleaseTagName('v2.2.0-1.0').ok).toBe(false)
    expect(checkReleaseTagName('v2.2.0-1.0-snapshot').ok).toBe(false)
    expect(checkReleaseTagName('v2.2').ok).toBe(false)
  })

  it('非 v 开头的 tag 不归这条规则管', () => {
    const r = checkReleaseTagName('backup-2026-10')
    expect(r.ok).toBe(true)
    expect(r.version).toBeUndefined()
  })
})

describe('checkTagAgainstPackage', () => {
  it('tag 与 package.json 一致才放行', () => {
    expect(checkTagAgainstPackage('v2.2.0', '2.2.0').ok).toBe(true)
  })

  it('不一致要拦下', () => {
    const r = checkTagAgainstPackage('v2.2.0', '2.2.0-1.0')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('2.2.0-1.0')
  })

  it('tag 本身不合规时优先报 tag 问题', () => {
    expect(checkTagAgainstPackage('v2.2.0-1.0', '2.2.0').ok).toBe(false)
  })
})

describe('checkLockSync', () => {
  it('两处都一致才通过', () => {
    expect(checkLockSync('2.1.1', '2.1.1', '2.1.1').ok).toBe(true)
  })

  it('顶层漂移要拦下（历史真实事故：pkg 2.1.0 / lock 2.0.0）', () => {
    const r = checkLockSync('2.1.0', '2.0.0', '2.0.0')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('package.json=2.1.0')
  })

  it('只有 packages[""] 漂移也要拦下', () => {
    expect(checkLockSync('2.1.1', '2.1.1', '2.1.0').ok).toBe(false)
  })
})

describe('compareCore', () => {
  it('比较 x.y.z 主体并忽略后缀', () => {
    expect(compareCore('2.2.0', '2.1.1')).toBe(1)
    expect(compareCore('2.1.1', '2.1.1-1.0-snapshot')).toBe(0)
    expect(compareCore('2.1.0', '2.1.1')).toBe(-1)
  })
})
