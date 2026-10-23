// ================================================
// tests/release-notes.test.ts — 发布说明生成的契约
//
// 发布说明不允许是「修了点东西」。它由提交记录自动生成：按 conventional commit
// 前缀分组、剔除 merge 噪声、带上对比基线与提交数，最终写进 docs/releases/ 并作为
// GitHub Release 正文。本文件守住分组、噪声过滤与兜底三类行为。
// ================================================

import { describe, expect, it } from 'vitest'
import { buildReleaseNotes, isNoise, parseSubject } from '../scripts/lib/releaseNotes.mjs'

describe('parseSubject', () => {
  it('解析 type(scope): text', () => {
    expect(parseSubject('fix(worker): 借用并发加 If-Match')).toEqual({
      type: 'fix',
      scope: 'worker',
      text: '借用并发加 If-Match',
    })
  })

  it('type 别名归一（hotfix/bugfix → fix，ci/build → chore）', () => {
    expect(parseSubject('hotfix: 修复').type).toBe('fix')
    expect(parseSubject('bugfix: 修复').type).toBe('fix')
    expect(parseSubject('ci: 调整流水线').type).toBe('chore')
    expect(parseSubject('build: 升级构建').type).toBe('chore')
  })

  it('带 ! 的破坏性标记也能解析', () => {
    const p = parseSubject('feat(api)!: 改接口')
    expect(p.type).toBe('feat')
    expect(p.text).toBe('改接口')
  })

  it('不规范的提交标题归到 other 且保留原文', () => {
    const p = parseSubject('顺手改了点东西')
    expect(p.type).toBe('other')
    expect(p.text).toBe('顺手改了点东西')
  })
})

describe('isNoise', () => {
  it('merge 提交算噪声', () => {
    expect(isNoise('merge: 合入缺陷修复批次')).toBe(true)
    expect(isNoise('Merge branch master')).toBe(true)
    expect(isNoise('Merge pull request #12')).toBe(true)
  })

  it('正常提交不算噪声', () => {
    expect(isNoise('fix: 修')).toBe(false)
    expect(isNoise('chore(release): 2.1.1')).toBe(false)
  })
})

describe('buildReleaseNotes', () => {
  const subjects = [
    'fix(worker): 已下架物品联系人不外泄',
    'feat: 支持按距离筛选',
    'merge: 合入批次',
    'chore: 升级依赖',
    '随便写的一句',
    'fix(detail): 深链误报不存在',
  ]

  it('按分组渲染，且各组只出现该组条目', () => {
    const md = buildReleaseNotes({
      version: '2.2.0',
      subjects,
      previousTag: 'v2.1.1',
      date: '2026-10-23',
    })
    expect(md).toContain('# v2.2.0 发布说明')
    expect(md).toContain('## 新功能')
    expect(md).toContain('## 缺陷修复')
    expect(md).toContain('## 工程与发布')
    expect(md).toContain('## 其他')
    expect(md).toContain('- **worker**：已下架物品联系人不外泄')
    expect(md).toContain('- 支持按距离筛选')
    expect(md).toContain('- 随便写的一句')
  })

  it('merge 提交不进说明，提交数按过滤后计', () => {
    const md = buildReleaseNotes({ version: '2.2.0', subjects, previousTag: 'v2.1.1' })
    expect(md).not.toContain('合入批次')
    expect(md).toContain('本次 5 个提交')
  })

  it('元信息包含基线 tag 与日期', () => {
    const md = buildReleaseNotes({
      version: '2.2.0',
      subjects: ['feat: x'],
      previousTag: 'v2.1.1',
      date: '2026-10-23',
    })
    expect(md).toContain('对比基线 v2.1.1')
    expect(md).toContain('发布日 2026-10-23')
  })

  it('没有可归类变更时给出明确兜底，而不是空章节', () => {
    const md = buildReleaseNotes({ version: '2.1.2', subjects: ['merge: 合并'], previousTag: 'v2.1.1' })
    expect(md).toContain('## 变更内容')
    expect(md).toContain('没有可归类的代码变更')
    expect(md).not.toContain('## 新功能')
  })

  it('测试基线传了才出现质量章节', () => {
    const withLine = buildReleaseNotes({ version: '2.2.0', subjects: ['feat: x'], testLine: '353 passed' })
    expect(withLine).toContain('## 质量基线')
    expect(withLine).toContain('测试：353 passed')

    const without = buildReleaseNotes({ version: '2.2.0', subjects: ['feat: x'] })
    expect(without).not.toContain('## 质量基线')
  })

  it('始终带升级方式，且结尾有换行', () => {
    const md = buildReleaseNotes({ version: '2.2.0', subjects: ['feat: x'] })
    expect(md).toContain('## 升级方式')
    expect(md.endsWith('\n')).toBe(true)
  })
})
