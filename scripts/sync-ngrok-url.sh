#!/usr/bin/env bash
# 本地：把服务器 ngrok 当前 URL 同步到 Cloudflare NSFWJS_URL 并重新部署
# 用法：CLOUDFLARE_API_TOKEN=xxx bash scripts/sync-ngrok-url.sh
# 说明：ngrok 免费版重启后域名会变，服务器端 start-ngrok.sh 会把新 URL 写到
#       ~/linli-ngrok/current-url.txt，本脚本读取它并同步到 Cloudflare。
set -euo pipefail

SSH_KEY="${LINLI_SSH_KEY:-$HOME/.ssh/linli_srv_4785}"
SRV="deploy@47.85.133.20"
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [ -z "$CF_TOKEN" ] && [ -f "$HOME/.linli-cf-token" ]; then
  CF_TOKEN="$(cat "$HOME/.linli-cf-token" | tr -d ' \r\n')"
fi
if [ -z "$CF_TOKEN" ]; then
  echo "❌ 未找到 Cloudflare API Token（设置 CLOUDFLARE_API_TOKEN 或 ~/.linli-cf-token）"
  exit 1
fi

SRV_URL=$(ssh -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes -i "$SSH_KEY" "$SRV" \
  'cat ~/linli-ngrok/current-url.txt 2>/dev/null || echo ""' 2>/dev/null | tr -d ' \r\n')
if [ -z "$SRV_URL" ]; then
  echo "❌ 未获取到服务器 ngrok URL（确认 ngrok 已启动）"
  exit 1
fi
AUDIT_URL="$SRV_URL/audit-image"
echo "审核端点: $AUDIT_URL"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

printf '%s\n' "$AUDIT_URL" | CLOUDFLARE_API_TOKEN="$CF_TOKEN" npx --yes wrangler@3 pages secret put NSFWJS_URL --project-name linli-haowu 2>&1 \
  | grep -viE "EPERM|wrangler-.*log|Proxy env|After install" | tail -3

CLOUDFLARE_API_TOKEN="$CF_TOKEN" bash scripts/deploy-pages.sh 2>&1 \
  | grep -viE "EPERM|wrangler-.*log|Proxy env|After install" | tail -3

echo "✅ 同步完成并已部署"
