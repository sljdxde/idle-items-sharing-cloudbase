// ================================================
// scripts/handle-comment.mjs — 评论命令自动处理（GitHub Actions 中运行）
// 监听 issue_comment created 时执行；命令（与 src/lib/github.ts 文案一致）：
//   「借用 138xxxx」→ 加 lent 标签 + DATA.borrowedBy/borrowedAt（仅 open 且未借出）
//   「归还」      → 去 lent 标签 + 清空 DATA.borrowedBy/borrowedAt
//   「下架」      → 关闭 Issue（仅 Issue 作者本人）
//   「上架」      → 重新打开 Issue（仅 Issue 作者本人）
// 每次操作后回复确认评论，交由 gen-items 重新生成快照。
// ================================================

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'sljdxde/idle-items-sharing-cloudbase'
const GH_API = 'https://api.github.com/repos'
const TOKEN = process.env.GITHUB_TOKEN ?? ''
const DATA_START = '<!--DATA_START'
const DATA_END = 'DATA_END-->'

// 入参：优先环境变量（Actions 传参最稳，可安全含换行/引号），否则 --arg= 形式
const argv = process.argv.slice(2)
function arg(name) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}

const issueNumber = Number(process.env.ISSUE_NUMBER || arg('issue'))
const comment = (process.env.COMMENT_BODY || arg('body') || '').trim()
const commenter = process.env.COMMENT_USER || arg('commenter')
const author = process.env.ISSUE_AUTHOR || arg('author')

async function api(path, method = 'GET', payload = null) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${TOKEN}`,
  }
  const init = { method, headers }
  if (payload !== null) init.body = JSON.stringify(payload)
  const res = await fetch(`${GH_API}/${REPO}${path}`, init)
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`)
  return res.status === 204 ? null : res.json()
}

async function reply(text) {
  await api(`/issues/${issueNumber}/comments`, 'POST', { body: text })
}

function extractData(body) {
  if (!body) return null
  const start = body.indexOf(DATA_START)
  const end = body.indexOf(DATA_END)
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(body.slice(start + DATA_START.length, end).trim())
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** 在 body 中更新 DATA 块（合并 patch）；返回新 body；无数据块返回 null */
function updateBlock(body, patch) {
  if (!body) return null
  const start = body.indexOf(DATA_START)
  const end = body.indexOf(DATA_END)
  if (start < 0 || end <= start) return null
  let data = {}
  try {
    data = JSON.parse(body.slice(start + DATA_START.length, end).trim())
  } catch {
    return null
  }
  Object.assign(data, patch)
  return (
    body.slice(0, start + DATA_START.length) +
    '\n' +
    JSON.stringify(data) +
    '\n' +
    body.slice(end)
  )
}

async function main() {
  if (!TOKEN) {
    console.error('handle-comment: 缺少 GITHUB_TOKEN')
    process.exitCode = 1
    return
  }
  if (!Number.isFinite(issueNumber) || !comment) {
    console.log('handle-comment: 参数缺失，跳过')
    return
  }

  const issue = await api(`/issues/${issueNumber}`)
  const data = extractData(issue.body ?? '') ?? {}

  // ── 借用 ──
  const borrowMatch = comment.match(/^借用\s+(1\d{10})$/)
  if (borrowMatch) {
    const phone = borrowMatch[1]
    if (issue.state !== 'open') {
      await reply('该物品已下架，无法借用。')
      return
    }
    const hasLent = (issue.labels ?? []).some((l) => l.name === 'lent')
    if (hasLent) {
      await reply('该物品已被借出，等归还后再来吧。')
      return
    }
    await api(`/issues/${issueNumber}/labels`, 'POST', { labels: ['lent'] })
    const body = updateBlock(issue.body ?? '', {
      borrowedBy: phone,
      borrowedAt: new Date().toISOString(),
    })
    if (body) await api(`/issues/${issueNumber}`, 'PATCH', { body })
    await reply(`✅ 已标记「借出」（借阅人 ${phone.slice(0, 3)}****${phone.slice(7)}）。归还时请回复「归还」。`)
    console.log(`handle-comment: issue#${issueNumber} 已借出（${phone}）`)
    return
  }

  // ── 归还 ──
  if (comment === '归还') {
    const hasLent = (issue.labels ?? []).some((l) => l.name === 'lent')
    if (!hasLent) {
      await reply('该物品当前不是借出状态。')
      return
    }
    await api(`/issues/${issueNumber}/labels/lent`, 'DELETE')
    const body = updateBlock(issue.body ?? '', {
      borrowedBy: undefined,
      borrowedAt: undefined,
    })
    if (body) await api(`/issues/${issueNumber}`, 'PATCH', { body })
    await reply('✅ 已归还，物品恢复「可借」。')
    console.log(`handle-comment: issue#${issueNumber} 已归还`)
    return
  }

  // ── 下架 / 上架（仅作者本人） ──
  if (comment === '下架' || comment === '上架') {
    const isAuthor = commenter === (issue.user?.login ?? '')
    if (!isAuthor) {
      await reply('只有发布者本人可以下架/上架物品。')
      return
    }
    if (comment === '下架') {
      await api(`/issues/${issueNumber}`, 'PATCH', { state: 'closed' })
      await reply('✅ 已下架，物品从公开列表隐藏。需要时回复「上架」恢复。')
      console.log(`handle-comment: issue#${issueNumber} 已下架`)
    } else {
      await api(`/issues/${issueNumber}`, 'PATCH', { state: 'open' })
      await reply('✅ 已重新上架。')
      console.log(`handle-comment: issue#${issueNumber} 已上架`)
    }
    return
  }

  // 其它评论：静默
  console.log(`handle-comment: issue#${issueNumber} 未匹配命令，忽略`)
}

main().catch((err) => {
  console.error('handle-comment: 失败', err.message)
  process.exitCode = 1
})
