// ================================================
// cloudflare-pages/functions/api/[[path]].js — Pages Function 入口（catch-all /api/*）
// 与 cloudflare-worker/worker.js 复用同一套 handle：pages.dev 自带可信 HTTPS，
// 国内可达（不同于被封的 workers.dev），作为「定位可用」的免费域名通道。
// 注意：Pages 无磁盘，图片走内嵌压缩（前端按 50KB 预算压缩），不落盘。
// 部署：见 cloudflare-pages/README 或根目录 README 的 Pages 部署段落。
// ================================================

import { handle } from '../../../cloudflare-worker/worker.js'

export async function onRequest(context) {
  return handle(context.request, context.env)
}
