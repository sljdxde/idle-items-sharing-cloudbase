// ================================================
// scripts/lib/releaseNotes.mjs — 由提交记录生成发布说明
//
// 发布说明不允许手写「修了点东西」—— 它必须是可追溯的：按 conventional commit
// 前缀分组，附对比基线 tag 与提交数，写进 docs/releases/vX.Y.Z.md 并作为
// GitHub Release 正文。纯函数，便于单测（见 tests/release-notes.test.ts）。
// ================================================

/** 分组顺序即渲染顺序；未命中的走 other */
const GROUPS = [
  ['feat', '新功能'],
  ['fix', '缺陷修复'],
  ['perf', '性能'],
  ['refactor', '重构'],
  ['test', '测试'],
  ['docs', '文档'],
  ['chore', '工程与发布'],
  ['other', '其他'],
]

const TYPE_ALIASES = {
  feat: 'feat',
  feature: 'feat',
  fix: 'fix',
  bugfix: 'fix',
  hotfix: 'fix',
  perf: 'perf',
  refactor: 'refactor',
  test: 'test',
  tests: 'test',
  docs: 'docs',
  doc: 'docs',
  chore: 'chore',
  build: 'chore',
  ci: 'chore',
  release: 'chore',
  style: 'refactor',
}

/** 合并提交不进发布说明（它们是流程噪声，不是变更） */
export function isNoise(subject) {
  const s = String(subject ?? '').trim()
  return /^(merge|Merge)\b/.test(s) || /^Merge (branch|pull request)/i.test(s)
}

/**
 * 解析 `type(scope): text`，非规范写法归到 other 且保留原文。
 * @param {string} subject
 * @returns {{type: string, scope: string, text: string}}
 */
export function parseSubject(subject) {
  const raw = String(subject ?? '').trim()
  const m = /^([a-z]+)(?:\(([^)]*)\))?!?:\s*(.+)$/i.exec(raw)
  if (!m) return { type: 'other', scope: '', text: raw }
  const type = TYPE_ALIASES[m[1].toLowerCase()] ?? 'other'
  return { type, scope: (m[2] ?? '').trim(), text: m[3].trim() }
}

/**
 * 生成发布说明 markdown。
 *
 * @param {object} input
 * @param {string} input.version     不带 v 前缀，如 2.2.0
 * @param {string[]} input.subjects  区间内的提交标题（新→旧或旧→新都行）
 * @param {string} [input.previousTag] 对比基线，如 v2.1.1；无基线传空
 * @param {string} [input.date]      YYYY-MM-DD
 * @param {string} [input.testLine]  测试基线描述，如 "353 passed | 3 skipped"
 * @param {string} [input.headline]  一句话总结（可选，写在最前面）
 */
export function buildReleaseNotes({
  version,
  subjects,
  previousTag = '',
  date = '',
  testLine = '',
  headline = '',
} = {}) {
  const list = (subjects ?? []).filter((s) => s && !isNoise(s))
  const buckets = new Map(GROUPS.map(([key]) => [key, []]))

  for (const subject of list) {
    const parsed = parseSubject(subject)
    buckets.get(parsed.type).push(parsed)
  }

  const lines = []
  lines.push(`# v${version} 发布说明`)
  lines.push('')
  const meta = []
  if (date) meta.push(`发布日 ${date}`)
  if (previousTag) meta.push(`对比基线 ${previousTag}`)
  meta.push(`本次 ${list.length} 个提交`)
  lines.push(`> ${meta.join(' · ')}`)
  lines.push('')

  if (headline) {
    lines.push(headline)
    lines.push('')
  }

  const rendered = GROUPS.filter(([key]) => buckets.get(key).length > 0)
  if (rendered.length === 0) {
    lines.push('## 变更内容')
    lines.push('')
    lines.push('- 本次发布没有可归类的代码变更（仅版本号 / 发布流程改动）。')
    lines.push('')
  }

  for (const [key, label] of rendered) {
    lines.push(`## ${label}`)
    lines.push('')
    for (const item of buckets.get(key)) {
      const scope = item.scope ? `**${item.scope}**：` : ''
      lines.push(`- ${scope}${item.text}`)
    }
    lines.push('')
  }

  if (testLine) {
    lines.push('## 质量基线')
    lines.push('')
    lines.push(`- 测试：${testLine}`)
    lines.push('')
  }

  lines.push('## 升级方式')
  lines.push('')
  lines.push('```bash')
  lines.push('git fetch --tags && git checkout master && git pull')
  lines.push('```')
  lines.push('')
  lines.push('线上两站会随发布更新：`linli-haowu.pages.dev`（主站，需 `npm run deploy:pages`）与 GitHub Pages 镜像。')

  return `${lines.join('\n')}\n`
}
