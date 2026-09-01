// ================================================
// scripts/handle-comment.mjs — 评论命令已关闭（ADR-0004）
// 公开仓库任何人都能发评论；借/还/上下架若走评论就等于绕过代理鉴权。
// 写操作只允许经 Cloudflare Worker / 自建代理（登录手机号）。
// ================================================

const comment = (process.env.COMMENT_BODY || '').trim()
const issueNumber = process.env.ISSUE_NUMBER || ''

if (/^(借用\s+1\d{10}|归还|下架|上架)$/.test(comment)) {
  console.log(
    `handle-comment: issue#${issueNumber} 收到「${comment.slice(0, 8)}」，已忽略（评论写通道已关闭）`,
  )
} else {
  console.log(`handle-comment: issue#${issueNumber || '?'} 未匹配命令，忽略`)
}
