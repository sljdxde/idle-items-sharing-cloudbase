<div align="center">
  <h1>邻里好物 v2（Vue 3 · 孟菲斯复古拼贴版）</h1>
  <p>一个极简、零服务器成本的社区闲置物品流转平台：数据存于 GitHub Issues，前端 Vue 3 + Vite + TypeScript。</p>

  <p>
    <img src="https://img.shields.io/badge/Vue_3-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D" alt="Vue 3">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
    <img src="https://img.shields.io/badge/GitHub_Issues-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Issues">
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License">
  </p>
</div>

<hr />

## 项目简介

专为追求**绝对零成本、不依赖任何云服务商注册**的场景设计：每件闲置物品是一条带 `item` 标签的 GitHub Issue，GitHub Actions 自动同步为同源 `items.json` 静态快照；前端零写凭证——发布走预填 Issue 创建链接，管理走 Issue 标签。

v2 相比 v1（`legacy/` 目录中的静态原版）：

- **工程化**：Vite 7 + Vue 3.5 `<script setup>` + TypeScript strict + Pinia + Vue Router（hash 模式）
- **设计语言**：孟菲斯复古拼贴（Memphis Maximalism）——复古撞色、硬阴影、胶带与错位叠放（见 `docs/adr/0002`）
- **新功能**：关键词搜索（名称/描述/楼号）+ 分类浏览（家居/电器/儿童/户外/工具/图书/服饰，旧数据自动关键词归类）
- **详情页**：`/#/items/:id` 独立路由，可分享
- **质量**：筛选逻辑纯函数化 + vitest 单测（16 例）

## 核心特性（v1 全保留）

- 定位 + Haversine 距离筛选（500m / 1km / 3km / 全部），已定位按距离排序
- 三级读取降级：items.json 快照 → 本地缓存 → 匿名 GitHub API → 空状态
- 图片外链懒加载、强制刷新、Toast 通知、移动端优先响应式

## 开发

```bash
npm install
npm run dev        # 本地开发（数据读根目录 items.json）
npm run test       # vitest 单测
npm run build      # 类型检查 + 构建到 dist/
npm run preview    # 预览构建产物
```

## 部署

- **GitHub Pages（默认）**：推送 master 即触发 `.github/workflows/deploy.yml` 自动构建发布；仓库 Settings → Pages 选 **GitHub Actions** 来源即可。首次启用需在 Actions 页允许一次工作流运行。
- **小红书 mini-tool（规划中）**：构建产物为相对路径（`base=./`），`dist/` 可直接进入 zip 打包流程。
- 数据同步 `sync-items.yml` 保持不变（15 分钟兜底 + issue 事件即时触发），并已透传新增的 `category` 字段。

## 目录结构

```text
├── index.html            # Vite 入口
├── src/
│   ├── lib/              # types / config / api(降级链) / filters(纯函数) / categories
│   ├── stores/           # Pinia：列表 + 筛选状态
│   ├── composables/      # useGeolocation / useToast
│   ├── components/       # Navbar / Footer / ItemCard / FilterToolbar / Modal / Toast
│   ├── pages/            # Home / Publish / Detail
│   └── styles/           # Memphis 设计 tokens + 基础样式
├── tests/                # vitest 单测
├── legacy/               # v1 静态站（存档，不再维护）
├── items.json            # Actions 生成的数据快照（CI 会拷入 dist）
├── design-samples/       # Phase 0 的 20 版风格样机（比选用）
└── docs/adr/             # 架构决策记录
```

---

## 开源说明 (License)

本项目基于 **[MIT License](LICENSE)** 协议开源。

<div align="center">
  <i>Let's share perfectly good things with the world.</i>
</div>
