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

「邻里好物」让好物在邻里间流转：按距离发现附近的闲置、手机号登录后借用 / 归还、发布自己的好物。**全体用户共享同一份数据**——物品存在云端 GitHub Issues，任何人打开网站看到的都是同一份列表。

### 核心功能

- **地理位置**：发布闲置时自动获取定位并保存；列表默认展示距离用户 **x 公里**内的物品（x 为可配置参数，见 `src/lib/geo.ts` 的 `DEFAULT_RADIUS_KM` / `RADIUS_OPTIONS`），按距离由近到远排序；无定位物品显示「距离未知」并排在末尾
- **手机号登录**：本地模拟登录，用于区分「我的发布」与「我的借用」视图
- **联系方式二选一**：发布时在「手机号」或「楼号门牌」中选择一种填写；展示时楼牌号在前
- **共享数据层（GitHub Issues）**：每条物品 = 一条带 `item` 标签的 Issue，隐藏数据块 `<!--DATA_START ... DATA_END-->` 存 JSON；Actions 自动生成 `items.json` 快照供全站读取
- **零写凭证**：前端不持有 Token——
  - **发布**：打开预填的 `issues/new` 链接，GitHub 提交即上架
  - **借用 / 归还 / 下架 / 上架**：在物品 Issue 评论区发送命令，Actions 自动处理（`借用 138xxxx` → 已借出；`归还` → 恢复可借；`下架` / `上架` → 仅发布者）
- **状态筛选**：默认不展示已借出物品，可通过「显示已借出」开关切换；「我的发布 / 我的借用」互斥切换（点击其一自动取消另一个）
- **图片上传**：发布时可上传单张图片（自动压缩），不上传时显示「小主没有上传图片哦」

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run test       # vitest 单测（GitHub 数据契约 + 状态机 + 距离 + 冒烟）
npm run build      # 类型检查(vue-tsc) + 构建 dist/
npm run preview    # 本地预览构建产物
```

## 部署（GitHub Pages + Issues 同步）

仓库已开启 **Settings → Pages → Source: GitHub Actions**（`build_type: workflow`）。`.github/workflows/deploy.yml` 触发 `push` / `issues` / `issue_comment`：

1. （评论事件时）`scripts/handle-comment.mjs` 处理借 / 还 / 下架 / 上架命令
2. `scripts/gen-items.mjs` 从 Issues 生成 `public/items.json` 快照
3. `npm run build` → 部署 Pages

线上地址：<https://sljdxde.github.io/idle-items-sharing-cloudbase/>

> 说明：写操作（发布 / 借用 / 归还 / 管理）需 GitHub 账号，这是「零服务器 + 全员共享」的代价；读操作任何访客无需登录。

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
