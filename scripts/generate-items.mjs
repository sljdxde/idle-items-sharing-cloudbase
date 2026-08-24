// ================================================
// scripts/generate-items.mjs — 本地快照生成器
// 与 .github/workflows/sync-items.yml 的映射逻辑逐字段一致；
// 用于本地开发/测试时把 GitHub Issues 即时物化为 items.json。
// 用法：node scripts/generate-items.mjs   （需 gh CLI 已登录）
// ================================================

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const REPO = 'sljdxde/idle-items-sharing-cloudbase'
const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/

const raw = execSync(
  `gh api "repos/${REPO}/issues?state=open&per_page=100&labels=item&sort=updated" --paginate`,
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
)
const issues = JSON.parse(raw)

const items = issues
  .filter((i) => !i.pull_request)
  .map((issue) => {
    let d = {}
    const m = issue.body ? issue.body.match(DATA_RE) : null
    if (m && m[1]) {
      try {
        d = JSON.parse(m[1].trim())
      } catch {}
    }
    const isLent = (issue.labels || []).some((l) => l.name === 'lent')
    return {
      id: issue.number,
      name: d.name || issue.title || '未知物品',
      desc: d.desc || '',
      contact: d.contact || '',
      building: d.building || '',
      lat: d.lat || null,
      lng: d.lng || null,
      imgUrl: (() => {
        if (d.imgUrl) return d.imgUrl
        const im =
          issue.body &&
          issue.body.match(/https:\/\/user-images\.githubusercontent\.com\/[^\s)>"']+/)
        return im ? im[0] : ''
      })(),
      // lent 标签是物主显式操作，优先级最高（与 sync-items.yml / src/lib/api.ts 保持一致）
      status: isLent ? 'borrowed' : d.status || 'available',
      category: d.category || '',
      requests: Array.isArray(d.requests) ? d.requests : [],
      pinCipher: d.pinCipher || '',
      hasLegacyPin: !!d.pin,
      createTime: issue.created_at,
    }
  })

writeFileSync('items.json', JSON.stringify(items, null, 2))
console.log(`items.json 已生成：${items.length} 件在架物品`)
