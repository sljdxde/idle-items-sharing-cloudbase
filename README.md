<div align="center">
  <h1>邻里好物 · 小红书小工具版</h1>
  <p>社区闲置物品互助共享 · 离线可用的 H5 小工具（Vue 3 + Vite + TS · 孟菲斯复古拼贴设计）</p>

  <p>
    <img src="https://img.shields.io/badge/Vue_3-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D" alt="Vue 3">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/离线小工具-FF2442?style=for-the-badge" alt="offline minitool">
  </p>
</div>

<hr />

## 项目简介

「邻里好物」让好物在邻里间流转：浏览邻居的闲置、发起借用申请、分享自己的好物。当前形态为**小红书 mini-tool 离线包**——纯本地运行，数据保存在用户设备（localStorage），零网络依赖。

演进历程：GitHub Issues 数据库静态站（v1，`legacy/`）→ Vue 3 重构 + 云端同步（v2）→ **去 GitHub 化的离线小工具**（当前，见 `docs/adr/0003`）。

## 功能

- 首页信息流：搜索（名称/描述/楼号）+ 八类分类筛选，孟菲斯拼贴卡片
- 发布：表单直发，照片经 canvas 压缩内嵌为 data:URI
- 借阅闭环：借用申请 → 物主确认 → 已借出 → 确认归还（完整状态机）
- 物品管理：确认/婉拒申请、下架与重新上架、永久删除

## 开发

```bash
npm install
npm run dev        # 本地开发
npm run test       # vitest 单测（19 例：本地状态机契约 + 筛选器）
npm run build      # 类型检查 + 构建 dist/
npm run package    # 一键出包：构建 → HTML 合规后处理 → 扫描门禁 → zip
```

## 打包（小红书 mini-tool）

产物：`linli-haowu-minitool.zip`（≈58KB，index.html 位于 zip 根目录）。

打包遵循 `.skill/SKILL.md` 及其 references 的容器规范：

| 规范要求 | 本项目落地 |
|---|---|
| 纯本地不联网 | localStorage 数据层；零外部资源引用 |
| 经典外置脚本 | IIFE 单包 + 构建后剥离 `type="module"` 并补 `defer` |
| 禁 geolocation 等 API | 距离筛选改为搜索/分类；18 项扫描门禁阻断回归 |
| zip 结构 | `scripts/package.sh` 从目录内容压缩 |

## 目录结构

```text
├── index.html            # Vite 入口
├── src/
│   ├── lib/              # types / localStore(数据层) / seed / filters / categories
│   ├── stores/           # Pinia：物品 CRUD 与借阅状态机
│   ├── components/       # Navbar/Footer/Card/Toolbar/Modal/Toast
│   ├── pages/            # Home / Publish / Detail（hash 路由）
│   └── styles/           # Memphis 设计 tokens + 基础样式
├── scripts/              # fix-dist-html / check-minitool / package.sh
├── tests/                # vitest 单测
├── .skill/               # 小红书小工具打包规范（SKILL.md + references）
├── legacy/               # v1/v2 历史版本存档
└── docs/adr/             # 架构决策记录（0001~0003）
```
