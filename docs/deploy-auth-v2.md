# 账号体系 v2 部署指南（ADR-0005）

> 手机号 + 6位管理口令 + JWT 会话，替代「手机号即身份」
> 部署方式：自建 Node.js 服务器（`server/proxy-server.mjs`）+ nginx 反向代理
> 实施前请先阅读 `docs/adr/0005-phone-pin-kv-auth.md`

## 一、变更概览

| 组件 | 变更 |
|---|---|
| 代理服务器 | `server/proxy-server.mjs` 新增 `/api/register`、`/api/login`、`/api/admin/reset-pin`；写接口改为 JWT 鉴权；用户凭证存 `server/data/users.json` |
| 前端 | `auth.ts` 重写为 JWT session；`LoginBox.vue` 重写为登录/注册双 Tab + 6格 PIN；`types.ts` 用 `ownerHash`/`borrowerHash` 替代明文手机号 |
| 数据 | GitHub Issue 数据块用 `ownerHash`/`borrowerHash`（HMAC-SHA256），不存明文手机号 |
| 快照 | `gen-items.mjs` 输出哈希字段，无明文手机号 |

## 二、环境变量配置

在服务器上创建环境变量文件（或在启动命令中直接设置）：

```bash
# server/.env（或直接在启动命令中 export）
export GITHUB_TOKEN=你的GitHub_Personal_Access_Token
export HASH_PEPPER=随机字符串（建议 openssl rand -hex 32）
export JWT_SECRET=随机字符串（建议 openssl rand -hex 32）
export ADMIN_TOKEN=随机字符串（管理员重置PIN用，自己保存好）
export PORT=8087
```

> **生成随机字符串的方法**：在终端运行 `openssl rand -hex 32`，会输出一串 64 字符的随机十六进制数。
>
> **这 3 个密钥（HASH_PEPPER / JWT_SECRET / ADMIN_TOKEN）务必保存到密码管理器**，丢失后所有用户需要重新注册。

### 各环境变量说明

| 变量 | 作用 | 缺失后果 |
|---|---|---|
| `GITHUB_TOKEN` | 访问 GitHub Issues API（读写物品数据） | 列表读取和写操作失败 |
| `HASH_PEPPER` | 计算 phoneHash 的 HMAC 密钥（手机号→哈希） | 注册/登录返回 500 |
| `JWT_SECRET` | 签发/验证 JWT 的密钥 | 注册/登录返回 500，写接口鉴权失败 |
| `ADMIN_TOKEN` | 管理员重置PIN接口的鉴权令牌 | 重置接口隐藏（返回404），用户忘记PIN无法恢复 |
| `PORT` | 服务器监听端口（默认 8087） | 用默认 8087 |

## 三、用户凭证存储

用户凭证（PIN 哈希）自动存储在 `server/data/users.json` 文件中：

```json
{
  "1b624ec1a01858c64aeebb520a500b5ce5f83901109a859d29cd11e7a79dad74": {
    "pinHash": "pbkdf2$100000$...",
    "salt": "随机16字节hex",
    "createdAt": "2026-09-07T..."
  }
}
```

- Key 是 `phoneHash`（手机号的 HMAC-SHA256），不存明文手机号
- Value 是 `pinHash`（PBKDF2 10万次迭代）+ `salt`（每个用户独立盐），不存明文 PIN
- 首次注册时自动创建 `server/data/` 目录和 `users.json` 文件
- **定期备份 `server/data/users.json`**，丢失后所有用户需要重新注册

## 四、部署步骤

### 第 1 步：拉取最新代码

```bash
cd /path/to/idle-items-sharing-cloudbase
git pull
```

### 第 2 步：安装依赖

```bash
npm install
cd server && npm install && cd ..
```

### 第 3 步：构建前端

```bash
npm run build
```

构建产物在 `dist/` 目录，代理服务器会自动服务这个目录。

### 第 4 步：配置环境变量

```bash
# 方式一：创建 .env 文件（推荐）
cat > server/.env << 'EOF'
export GITHUB_TOKEN=你的GitHub_TOKEN
export HASH_PEPPER=你的HASH_PEPPER
export JWT_SECRET=你的JWT_SECRET
export ADMIN_TOKEN=你的ADMIN_TOKEN
export PORT=8087
EOF

# 方式二：直接在启动命令中设置（见下一步）
```

### 第 5 步：启动服务器

```bash
# 方式一：用 .env 文件
cd server
source .env
node proxy-server.mjs

# 方式二：直接设置环境变量
cd server
GITHUB_TOKEN=xxx HASH_PEPPER=xxx JWT_SECRET=xxx ADMIN_TOKEN=xxx PORT=8087 node proxy-server.mjs
```

启动成功会显示：
```
linli proxy+static on http://127.0.0.1:8087
```

如果缺少 HASH_PEPPER 或 JWT_SECRET，会显示警告：
```
⚠️  HASH_PEPPER / JWT_SECRET 未配置，注册/登录接口将返回 500
```

### 第 6 步：配置 nginx 反向代理（生产环境）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8087;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 上传的图片（代理服务器自动处理 /uploads/）
    location /uploads/ {
        proxy_pass http://127.0.0.1:8087;
    }
}
```

### 第 7 步：用 systemd 管理进程（可选，推荐）

创建 `/etc/systemd/system/linli-proxy.service`：

```ini
[Unit]
Description=Neighborhood Share Proxy
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/idle-items-sharing-cloudbase/server
Environment=GITHUB_TOKEN=你的GitHub_TOKEN
Environment=HASH_PEPPER=你的HASH_PEPPER
Environment=JWT_SECRET=你的JWT_SECRET
Environment=ADMIN_TOKEN=你的ADMIN_TOKEN
Environment=PORT=8087
ExecStart=/usr/bin/node proxy-server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

然后：
```bash
sudo systemctl daemon-reload
sudo systemctl enable linli-proxy
sudo systemctl start linli-proxy
sudo systemctl status linli-proxy
```

## 五、验证清单

部署完成后，按以下清单测试：

### 5.1 注册流程
- [ ] 打开网站，点击登录
- [ ] 切换到「注册」Tab
- [ ] 输入手机号 + 6位 PIN（非弱PIN）+ 确认 PIN
- [ ] 点击注册，提示成功
- [ ] 登录态保持（刷新页面仍登录）

### 5.2 弱PIN拦截
- [ ] 输入 123456 → 提示"管理口令过于简单"
- [ ] 输入 111111 → 提示"管理口令过于简单"
- [ ] 输入 012345 → 提示"管理口令过于简单"

### 5.3 登录流程
- [ ] 退出登录
- [ ] 切换到「登录」Tab
- [ ] 输入正确的手机号 + PIN，登录成功
- [ ] 输入错误的 PIN，提示"手机号或管理口令错误"（不区分是哪个错）
- [ ] 输入未注册的手机号，提示"手机号或管理口令错误"

### 5.4 写操作鉴权
- [ ] 登录后发布物品，成功
- [ ] 登录后借用物品，成功
- [ ] 退出登录后，借用按钮提示登录
- [ ] 未登录时调用写接口（curl），返回 401

### 5.5 数据隔离
- [ ] 用户 A 发布的物品，用户 B 不能删除/下架
- [ ] 用户 A 借走的物品，用户 B 不能归还
- [ ] 「我的发布」只显示当前用户发布的物品
- [ ] 「我的借用」只显示当前用户借走的物品

### 5.6 公开数据隐私
- [ ] 查看 GitHub Issue 数据块，只有 `ownerHash`，没有明文手机号
- [ ] 查看 `/api/items` 列表，只有 `ownerHash`/`borrowerHash`，没有明文手机号
- [ ] 查看 `server/data/users.json`，只有 `phoneHash` 和 `pinHash`，没有明文

### 5.7 管理员重置PIN
- [ ] 调用管理员接口重置某用户的 PIN
- [ ] 用户用新 PIN 登录成功
- [ ] 旧 PIN 登录失败

## 六、管理员操作指南

### 6.1 重置用户PIN（用户忘记PIN时）

```bash
curl -X POST http://你的域名/api/admin/reset-pin \
  -H "Content-Type: application/json" \
  -H "x-site-key: neighborhood-share-2026" \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -d '{"phone":"13800000001"}'
```

返回：
```json
{
  "ok": true,
  "phone": "138****0001",
  "temporaryPin": "529871"
}
```

将 `temporaryPin` 告知用户，用户登录后可继续使用。

### 6.2 指定新PIN重置

```bash
curl -X POST http://你的域名/api/admin/reset-pin \
  -H "Content-Type: application/json" \
  -H "x-site-key: neighborhood-share-2026" \
  -H "x-admin-token: 你的ADMIN_TOKEN" \
  -d '{"phone":"13800000001","newPin":"654321"}'
```

### 6.3 查看已注册用户数

```bash
# users.json 中的 key 数量就是已注册用户数
cat server/data/users.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"
```

## 七、备份与恢复

### 备份

定期备份以下文件：
- `server/data/users.json` — 用户凭证（最重要，丢失后所有用户需重新注册）
- `server/uploads/` — 用户上传的图片

```bash
# 备份脚本示例
tar -czf backup-$(date +%Y%m%d).tar.gz server/data/users.json server/uploads/
```

### 恢复

```bash
# 解压备份到对应目录
tar -xzf backup-20260907.tar.gz -C /path/to/idle-items-sharing-cloudbase/
# 重启服务
sudo systemctl restart linli-proxy
```

## 八、回滚方案

如果部署后出现严重问题：

1. **前端回滚**：`git revert` 到部署前的 commit，重新 `npm run build`，重启服务
2. **用户凭证保留**：`server/data/users.json` 不会被回滚影响，用户无需重新注册
3. **旧版兼容性**：新版代码不兼容旧版的明文手机号数据，如果回滚到旧版，需要确保 GitHub Issue 数据块中仍有 `ownerPhone` 字段（新版代码不会删除旧字段，只是不写入）

## 九、常见问题

### Q: 用户忘记 PIN 怎么办？
A: 管理员调用 `/api/admin/reset-pin` 接口重置，将临时 PIN 告知用户。

### Q: HASH_PEPPER 泄露了怎么办？
A: HASH_PEPPER 泄露后，攻击者可以从手机号计算哈希（但无法从哈希反推手机号）。建议更换 HASH_PEPPER 并通知所有用户重新注册（因为旧的 phoneHash 无法映射到新的 pepper）。

### Q: JWT_SECRET 泄露了怎么办？
A: 立即更换 JWT_SECRET 并重启服务，所有用户会被强制退出登录（JWT 验证失败），重新登录即可。

### Q: users.json 丢失了怎么办？
A: 所有用户需要重新注册。务必定期备份 `server/data/users.json`。

### Q: 为什么不用 bcrypt？
A: 用 Web Crypto API 原生支持的 PBKDF2（100,000 次迭代 + SHA-256），安全性与 bcrypt 相当，且在 Node.js 和 Cloudflare Worker 环境中都能原生运行，无需额外依赖。

### Q: PIN 只有 6 位数字，会不会被暴力破解？
A: 6 位数字有 100 万种组合，配合 PBKDF2 10 万次迭代，单次验证需要约 100ms，暴力破解全部组合需要约 27 小时。加上登录失败限流（同一 IP 10 分钟内最多 40 次写请求），实际暴力破解几乎不可能。建议用户不要用生日、123456 等弱PIN（系统已拦截常见弱PIN）。
