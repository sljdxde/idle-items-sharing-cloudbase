// ================================================
// scripts/gen-items.mjs — 从 GitHub Issues 生成 public/items.json 静态快照
// 在 GitHub Actions 中运行（有 GITHUB_TOKEN 时高配额；否则匿名）
//
// 映射统一走 cloudflare-worker/items.js 的 toItem（与 Worker / 前端同一份），
// 这里只做「快照特有的加工」：图片白名单、描述截断、已下架物品打码。
// 历史教训：本文件曾单独抄一份 parseIssue，漏了 rentType/rentFee/rentRecords，
// 导致从快照读到的物品全是「免费」、租金统计恒为 0，直到实时校准才纠正。
// ================================================

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toItem } from '../cloudflare-worker/items.js'

const REPO = 'sljdxde/idle-items-sharing-cloudbase'
const GH_API = 'https://api.github.com/repos'
const TOKEN = process.env.GITHUB_TOKEN ?? ''

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'items.json')

async function api(path) {
  const headers = { Accept: 'application/vnd.github+json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
  const res = await fetch(`${GH_API}/${REPO}${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

function safeImgUrl(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^\/uploads\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(u)) return u
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+=*$/i.test(u)) return u
  return ''
}

/**
 * Issue → 快照条目。
 * 已下架（closed）物品的联系方式在静态快照里一律清空：items.json 是匿名可取的，
 * 「下架」的语义就是从公开面撤下，联系方式不能还躺在里面。
 * 物主自己打开详情页时，前端会用带 JWT 的实时接口重新校准，届时能看到自己的联系方式。
 */
export function parseIssue(issue) {
  const item = toItem(issue)
  return {
    ...item,
    desc: String(item.desc ?? '').slice(0, 300),
    imgUrl: safeImgUrl(item.imgUrl),
    contact: item.archived ? '' : item.contact,
  }
}

async function main() {
  try {
    const issues = await api(`/issues?state=all&labels=item&per_page=100&sort=updated&direction=desc`)
    const items = issues.map(parseIssue)
    // 空目录不被 git 跟踪，checkout 后 public/ 可能不存在，先建目录
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, JSON.stringify(items, null, 2), 'utf8')
    console.log(`gen-items: 已写入 ${items.length} 件物品 -> public/items.json`)
  } catch (err) {
    console.error(`gen-items: 失败（${err.message}），保留旧快照或写空数组`)
    try {
      writeFileSync(OUT, '[]', 'utf8')
    } catch {
      /* ignore */
    }
    process.exitCode = 1
  }
}

// 被 import（测试）时不执行主流程
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
