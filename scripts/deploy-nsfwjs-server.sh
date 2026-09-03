#!/usr/bin/env bash
# ================================================
# scripts/deploy-nsfwjs-server.sh — 将 NSFWJS 审核服务部署到自建服务器（47.85.133.20）
# 用法：
#   方式一（本机有服务器 SSH 凭据时）：
#     SERVER_USER=root SERVER_HOST=47.85.133.20 bash scripts/deploy-nsfwjs-server.sh
#   方式二（手动）：按下方注释步骤，在本机打包 server/ 目录，scp 到服务器，再在服务器上执行
# ================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER_USER="${SERVER_USER:-root}"
SERVER_HOST="${SERVER_HOST:-47.85.133.20}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_DIR="~/linli-nsfwjs"

ssh_opt=(-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=no)
[ -n "$SSH_KEY" ] && ssh_opt+=(-i "$SSH_KEY")

echo '── ① 本地打包 server/ ──'
TARBALL="/tmp/linli-nsfwjs-server.tgz"
tar -czf "$TARBALL" -C server nsfwjs-server.mjs package.json package-lock.json 2>/dev/null || \
  tar -czf "$TARBALL" -C server nsfwjs-server.mjs package.json
ls -lh "$TARBALL"

echo '── ② 上传到服务器 ──'
ssh "${ssh_opt[@]}" "$SERVER_USER@$SERVER_HOST" "mkdir -p $REMOTE_DIR"
scp "${ssh_opt[@]}" "$TARBALL" "$SERVER_USER@$SERVER_HOST:$REMOTE_DIR/server.tgz"

echo '── ③ 服务器：解压 + 安装依赖 + 编译原生模块 ──'
ssh "${ssh_opt[@]}" "$SERVER_USER@$SERVER_HOST" "
  cd $REMOTE_DIR &&
  tar -xzf server.tgz &&
  rm -f server.tgz &&
  npm install --no-audit --no-fund 2>&1 | tail -3 &&
  echo '── rebuild tfjs-node（原生编译，可能数分钟）──' &&
  npm rebuild @tensorflow/tfjs-node --build-addon-from-source 2>&1 | tail -3
"

echo '── ④ 服务器：启动服务 ──'
ssh "${ssh_opt[@]}" "$SERVER_USER@$SERVER_HOST" "
  cd $REMOTE_DIR &&
  pkill -f nsfwjs-server.mjs 2>/dev/null || true &&
  nohup node nsfwjs-server.mjs > nsfwjs.log 2>&1 &
  sleep 4 &&
  echo '── /health 验证 ──' &&
  curl -s -m 60 http://127.0.0.1:8090/health || echo '(模型加载需稍候，可再次 curl)'
"

echo '── ⑤ 提示：nginx 反代（手动）──'
cat <<'NGINX'
在服务器 nginx 对应 server 块内新增（反代到本地 8090）：
  location /audit-image {
      proxy_pass http://127.0.0.1:8090/audit-image;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_read_timeout 15s;
      client_max_body_size 1m;
  }
重载：nginx -s reload
公网地址即：http://47.85.133.20/audit-image
（若服务器已有 HTTPS 域名则用 https://<域名>/audit-image）
NGINX

echo '✔ 部署完成。请配置 nginx 反代后，把公网 URL 告诉我，由我更新 Worker 的 NSFWJS_URL 并重新部署。'
