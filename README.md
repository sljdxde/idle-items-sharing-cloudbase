<div align="center">
  <h1>邻里好物</h1>
  <p>社区闲置物品互助共享 · 纯前端本地数据应用（Vue 3 + Vite + TS · 孟菲斯复古拼贴设计）</p>

  <p>
    <img src="https://img.shields.io/badge/Vue_3-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D" alt="Vue 3">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Data-localStorage-FF2442?style=for-the-badge" alt="localStorage">
  </p>
</div>

<hr />

## 项目简介

「邻里好物」让好物在邻里间流转：按距离发现附近的闲置、手机号登录后借用 / 归还、发布自己的好物。纯前端实现，数据保存在用户设备（localStorage），无后端、无第三方服务依赖。

### 核心功能

- **地理位置**：发布闲置时自动获取定位并保存；列表默认展示距离用户 **x 公里**内的物品（x 为可配置参数，见 `src/lib/geo.ts` 的 `DEFAULT_RADIUS_KM` / `RADIUS_OPTIONS`），并按距离由近到远排序
- **手机号登录**：以手机号作为用户唯一标识（本地模拟登录），据此区分发布者与借阅者
- **联系方式二选一**：发布时在「手机号」或「楼号门牌」中选择一种填写
- **借阅 / 归还状态机**：借阅者确认借用后物品状态变「已借出」（记录借阅人手机号）；借阅者点击归还后恢复「可借」
- **上架 / 下架**：发布者可下架自己的物品（从公共列表隐藏、可重新上架）
- **状态筛选**：默认不展示已借出物品，可通过「显示已借出」开关切换查看（已借出物品带状态标记）

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run test       # vitest 单测（状态机 + 距离 + 筛选 + 生产包冒烟）
npm run build      # 类型检查(vue-tsc) + 构建 dist/
npm run preview    # 本地预览构建产物
```

## 部署（GitHub Pages）

仓库已开启 **Settings → Pages → Source: GitHub Actions**（`build_type: workflow`）。推送 `master` 即由 `.github/workflows/deploy.yml` 自动 `npm ci` → `npm run build` → 部署 Pages。

线上地址：<https://sljdxde.github.io/idle-items-sharing-cloudbase/>

## 目录结构

```text
├── index.html            # Vite 入口
├── src/
│   ├── lib/              # types / geo(定位与距离) / itemOps(借还状态机) / validate / localStore / seed / filters / categories
│   ├── stores/           # Pinia：items(物品与筛选) / auth(手机号登录)
│   ├── components/       # Navbar / Toolbar / Card / BorrowModal / ManageModal / LoginBox / LoginModal / Toast
│   ├── pages/            # Home / Publish / Detail（hash 路由）
│   └── styles/           # Memphis 设计 tokens + 基础样式
├── tests/                # vitest 单测 + 生产包冒烟门禁
├── legacy/               # v1/v2 历史版本存档
└── docs/adr/             # 架构决策记录
```
