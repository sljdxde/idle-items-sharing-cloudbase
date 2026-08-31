<div align="center">
  <h1>邻里好物</h1>
  <p>社区闲置物品互助共享 · GitHub Issues 共享数据层（Vue 3 + Vite + TS · 孟菲斯复古拼贴设计）</p>

  <p>
    <img src="https://img.shields.io/badge/Vue_3-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D" alt="Vue 3">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Data-GitHub_Issues-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Issues">
  </p>
</div>

<hr />

## 项目简介

「邻里好物」让好物在邻里间流转：按距离发现附近的闲置、手机号登录后借用 / 归还、发布自己的好物。**全体用户共享同一份数据**——物品存在云端（GitHub Issues 承载，用户对 GitHub 全程无感），任何人打开网站看到的都是同一份列表。

### 核心功能

- **地理位置**：发布闲置时自动获取定位并保存；列表默认展示距离用户 **x 公里**内的物品（x 为可配置参数，见 `src/lib/geo.ts` 的 `DEFAULT_RADIUS_KM` / `RADIUS_OPTIONS`），按距离由近到远排序；无定位物品显示「距离未知」并排在末尾
- **手机号登录**：本地模拟登录，用于区分「我的发布」与「我的借用」视图
- **联系方式二选一**：发布时在「楼号门牌」或「手机号」中选择一种填写（楼号优先）；展示时楼牌号在前
- **共享数据层**：每条物品 = 一条带 `item` 标签的 Issue，隐藏数据块 `<!--DATA_START ... DATA_END-->` 存 JSON；Actions 自动生成 `items.json` 同源快照供全站读取
- **站内完成所有操作（用户无感 GitHub）**：前端不持有 Token——
  - **发布 / 借用 / 归还 / 下架 / 上架**：浏览器调用 Cloudflare Worker 薄代理（`cloudflare-worker/`，ADR-0001），代理持 GitHub Token 写 Issues；Token 永不进客户端
  - 代理未部署时读操作仍可用（快照 → 种子兜底），写操作友好提示「云端服务尚未开通」
- **状态筛选**：默认不展示已借出物品，可通过「显示已借出」开关切换；「我的发布 / 我的借用」双大卡互斥切换（点击其一自动取消另一个）
- **图片上传**：发布时可上传单张图片（自动压缩），不上传时显示「小主没有上传图片哦」

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run test       # vitest 单测（GitHub 数据契约 + 状态机 + 距离 + 冒烟）
npm run build      # 类型检查(vue-tsc) + 构建 dist/
npm run preview    # 本地预览构建产物
```

## 部署（GitHub Pages + Issues 同步 + Worker 代理）

仓库已开启 **Settings → Pages → Source: GitHub Actions**（`build_type: workflow`）。`.github/workflows/deploy.yml` 触发 `push` / `issues` / `issue_comment`：

1. （评论事件时，历史兼容）`scripts/handle-comment.mjs` 处理借 / 还 / 下架 / 上架命令
2. `scripts/gen-items.mjs` 从 Issues 生成 `public/items.json` 同源快照
3. `npm run build` → 部署 Pages

写操作代理（Cloudflare Worker，用户无感 GitHub 的关键）：

```bash
cd cloudflare-worker
wrangler deploy
wrangler secret put GITHUB_TOKEN   # 本仓 repo 权限 PAT
wrangler secret put SITE_KEY       # 可选；需与 src/lib/api.ts 的 SITE_KEY 一致
```

前端 `API_PROXY` 为运行时自动判定：`*.github.io` 走 Worker；其他域名/IP（自建服务器）走同源 `/api`，一份构建两处可用。

线上地址：<https://sljdxde.github.io/idle-items-sharing-cloudbase/>

### 自建服务器（可选，国内加速）

workers.dev 在部分国内网络不可达；有一台服务器时可整站托管加速：

```bash
# 服务器（非 root 用户即可）：上传 dist/ 与 server/proxy-server.mjs 到 ~/linli/
echo '<GitHub PAT>' > ~/linli/.token && chmod 600 ~/linli/.token
nohup node ~/linli/proxy-server.mjs > ~/linli/server.log 2>&1 &   # 监听 127.0.0.1:8087
# nginx 80 端口 server_name <服务器IP> 反代到 127.0.0.1:8087（client_max_body_size 10m）
```

`server/proxy-server.mjs` 与 Worker 同契约：`/api/*` 代理写操作，其余路径服务 `dist/` 静态站。

> 说明：写操作（发布 / 借用 / 归还 / 管理）经代理在站内完成，用户无需 GitHub 账号；读操作任何访客无需登录。

## 目录结构

```text
├── index.html            # Vite 入口
├── src/
│   ├── lib/              # types / github(Issues 数据层) / geo(定位距离) / itemOps(状态机) / contact / image / validate / filters / categories
│   ├── stores/           # Pinia：items(物品与筛选) / auth(手机号登录)
│   ├── components/       # Navbar / MyPanel / Toolbar / Card / BorrowModal / ManageModal / LoginBox / LoginModal / Toast
│   ├── pages/            # Home / Publish / Detail（hash 路由）
│   └── styles/           # Memphis 设计 tokens + 基础样式
├── scripts/              # gen-items.mjs（Issues→快照） / handle-comment.mjs（评论命令）
├── tests/                # vitest 单测 + 生产包冒烟门禁
├── legacy/               # v1/v2 历史版本存档
└── docs/adr/             # 架构决策记录
```
