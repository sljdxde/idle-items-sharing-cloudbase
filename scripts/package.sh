#!/usr/bin/env bash
# ================================================
# scripts/package.sh — 小红书小工具一键构建打包
# 流程：类型检查 → 构建 → HTML 后处理 → 自检扫描 → 打 zip（内容在根）
# 产物：linli-haowu-minitool.zip
# ================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo '── ① 类型检查 ──'
npx vue-tsc -b

echo '── ② 清理并构建 ──'
rm -rf dist
npx vite build

echo '── ③ HTML 后处理（去 module 标记） ──'
node scripts/fix-dist-html.mjs dist

echo '── ④ 合规自检（SKILL.md 扫描清单） ──'
node scripts/check-minitool.mjs dist

echo '── ⑤ 打包（压缩目录内容，index.html 必须在 zip 根） ──'
ZIP='linli-haowu-minitool.zip'
rm -f "$ZIP"
( cd dist && zip -qr "../$ZIP" . -x '*.DS_Store' )
ls -lh "$ZIP"

echo '── 完成 ──'
unzip -l "$ZIP"
