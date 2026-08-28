<div align="center">
  <h1>邻里好物 · GitHub Pages 版</h1>
  <p>社区闲置物品互助共享 · 零服务器静态站（Vue 3 + Vite + TS · 孟菲斯复古拼贴设计）</p>

  <p>
    <img src="https://img.shields.io/badge/Vue_3-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D" alt="Vue 3">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/GitHub_Pages-222222?style=for-the-badge&logo=githubpages&logoColor=white" alt="GitHub Pages">
    <img src="https://img.shields.io/badge/Data%20via-GitHub_Issues-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Issues">
  </p>
</div>

<hr />

## 项目简介

「邻里好物」让好物在邻里间流转：浏览邻居的闲置、发起借用、分享自己的好物。本站为**零服务器**静态站——

- 托管在 **GitHub Pages**（Vue 3 + Vite 构建产物，`hash` 路由免 SPA fallback 配置）；
- 数据以 **GitHub Issues 当数据库**：每条物品是一条带 `item` 标签的 Issue，隐藏数据块 `<!--DATA_START ... DATA_END-->` 存 JSON；
- 由 **GitHub Actions**（`deploy.yml`）在每次 push / Issue 变更时，调用 REST API 生成同源静态快照 `items.json` 供前端读取；
- 前端**不持有任何写凭证**：发布走预填的 `issues/new` 链接（用户登录 GitHub 提交），管理走 GitHub 标签（加 / 去 `lent` = 借出 / 归还）与关闭 Issue（下架）。

演进历程：GitHub Issues 数据库静态站（v1，`legacy/`）→ Vue 3 重构 + 云端同步（v2）→ 去 GitHub 化的离线小工具（见 `docs/adr/0003`）→ **回归 GitHub Pages + Issues 集成（当前）**。

## 功能

- 首页信息流：搜索（名称 / 描述 / 楼号）+ 八类分类筛选，孟菲斯拼贴卡片
- 发布：填写表单后打开预填的 GitHub Issue 创建页（图片用链接），登录即发布
- 借用：前端展示物主联系方式，并引导至对应 GitHub Issue 与物主沟通
- 管理：引导物主在 GitHub 上操作——加 `lent` 标签借出、去掉归还、关闭 Issue 下架
- 数据兜底：优先读 `items.json` 快照；快照不可用时回退到 GitHub REST API 实时读取；再不行用内置 seed

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run test       # vitest 单测（状态机契约 + 筛选器 + 数据层）
npm run build      # 类型检查(vue-tsc) + 构建 dist/
npm run preview    # 本地预览构建产物
```

## 部署（GitHub Pages）

仓库已开启 **Settings → Pages → Source: GitHub Actions**（`build_type: workflow`）。推送 `master` 或 Issue 变更即由 `.github/workflows/deploy.yml` 自动：

1. `npm ci` → `node scripts/gen-items.mjs`（从 Issues 生成 `public/items.json`）→ `npm run build`；
2. `actions/upload-pages-artifact@v3` 上传 `dist/`；
3. `actions/deploy-pages@v4` 部署到 GitHub Pages。

线上地址：<https://sljdxde.github.io/idle-items-sharing-cloudbase/>

> 若 Actions 被停用需恢复：到仓库 Settings → Pages 确认 Source 为 "GitHub Actions"，再对 `master` 任意 push 或手动 `workflow_dispatch` 重跑 `deploy.yml` 即可。

## 目录结构

```text
├── index.html            # Vite 入口
├── src/
│   ├── lib/              # types / github(Issues 数据层) / localStore(seed 兜底) / filters / categories
│   ├── stores/           # Pinia：物品读取、筛选、发布(打开 Issue 链接)
│   ├── components/       # Navbar/Footer/Card/Toolbar/BorrowModal/ManageModal/Toast
│   ├── pages/            # Home / Publish / Detail（hash 路由）
│   └── styles/           # Memphis 设计 tokens + 基础样式
├── scripts/              # gen-items.mjs（Issues → items.json）
├── tests/                # vitest 单测 + 生产包冒烟门禁
├── legacy/               # v1/v2 历史版本存档
└── docs/adr/             # 架构决策记录（0001~0003）
```
