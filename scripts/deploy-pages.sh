#!/usr/bin/env bash
# ================================================
# scripts/deploy-pages.sh — 主站（Cloudflare Pages）发布脚本
#
# 相比旧 deploy:pages 的修复点：
#   1. wrangler 检测的是「cwd/functions」而非 dist/functions，
#      因此改用 `wrangler pages functions build` 显式编译 functions -> dist/_worker.js
#   2. 高级模式：_worker.js + _routes.json，仅 /api/* 走 Worker，静态资源仍由 Pages 提供
#   3. `--branch main`：项目 production_branch=main、git 分支是 master，
#      不加 --branch 会被当作 preview 部署，主站（production）不会更新
#
# 部署后主站：https://linli-haowu.pages.dev/
# ================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/4] 构建前端（vue-tsc + vite build）..."
npm run build

echo "[2/4] 写入 dist/_routes.json（仅 /api/* 走 Worker）..."
cat > dist/_routes.json <<'EOF'
{"version":1,"include":["/api/*"],"exclude":[]}
EOF

echo "[3/4] 编译 Pages Functions -> dist/_worker.js ..."
npx --yes wrangler@3 pages functions build --outdir dist cloudflare-pages/functions
mv -f dist/index.js dist/_worker.js

echo "[4/4] 部署到 Cloudflare Pages（production，--branch main）..."
npx --yes wrangler@3 pages deploy dist --project-name linli-haowu --branch main

echo "✔ 部署完成：https://linli-haowu.pages.dev/"
