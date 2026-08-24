# ADR-0002: v2 完全重构 — Vue 3 工程化 + 孟菲斯设计语言

- **状态**：Accepted
- **日期**：2026-08-21
- **关联**：ADR-0001（写操作代理，本轮维持「方案1 纯 GitHub 闭环」，代理端点留作未来升级）

## Context（背景）

v1 为无构建双页静态站（HTML + 原生 JS 字符串拼 DOM），设计系统为 TDesign 冷蓝工具风。需求：

1. **完全重构**：功能保住 v1 全部能力（列表/定位距离筛选/三级降级读取/GitHub 写路径），技术栈升级到现代工程化。
2. **设计重定调**：经 20 版风格样机比选（`design-samples/`，基于 huashu-design 风格库），用户选定 **03 号孟菲斯复古拼贴 Memphis Maximalism**——复古撞色、硬阴影、错位叠放、玩味市集气质。
3. **新增功能**：关键词搜索 + 分类浏览。

## Decision（决策）

### 技术栈
- **Vite 7 + Vue 3.5 `<script setup>` + TypeScript strict**；Pinia（数据与筛选状态）+ Vue Router（**hash 模式**：GitHub Pages 免 SPA fallback 配置，且产物可整体打包成小红书 mini-tool zip 深链接可用）。
- **样式弃用 Tailwind，改用 CSS 设计 tokens + 组件 scoped 样式**。理由：孟菲斯是全定制艺术指导型设计（胶带、旋转、撞色硬阴影、网点纹理），utility-first 覆盖率低反而添噪；tokens.css 单点承载色板/字体/easing 即可。
- **构建产物 base='./' 相对路径**：任意子路径 / Pages / webview 均可运行。
- 数据层不变：GitHub Issues 仍是数据库；读路径保持 items.json 快照 → 本地缓存 → 匿名 API 三级降级（`src/lib/api.ts`）。

### 新增领域概念：Category（分类）
- Item 增加可选 `category` 字段（home/electronics/kids/outdoor/tools/books/clothing/other）。
- 发布表单手动选择；旧数据无此字段时由 `inferCategory()` 关键词推断，**仅展示层生效，不回写**。
- `sync-items.yml` 同步透传该字段。

### 纯函数 seam
筛选逻辑（分类/搜索/距离/排序）抽为 `src/lib/filters.ts` 纯函数，16 个单测覆盖（vitest）；store 只做编排。

## Consequences（后果）

**正面**
- 组件化 + 类型安全 + 可测试；旧静态站完整保留于 `legacy/`。
- GitHub Pages 由新增 `deploy.yml` 自动构建部署，线上不中断；`items.json` 在 CI 中拷入 dist。
- 搜索与分类为后续（站内借阅闭环、地图视图）铺平了信息架构。

**负面 / 代价**
- 引入 Node 构建链：贡献门槛从「改 HTML」变为「需 npm install」。
- Google Fonts（DM Serif Display/Bungee/Space Mono）为西文字体，中文回退系统宋体/黑体——跨设备字重略有差异（可接受，后续可子集化中文字体）。
- hash 路由 URL 带 `#/`，牺牲一点美观换零配置可移植性。

## 备选（被否决）
- **Tailwind v4**：见上，覆盖率不足。
- **history 路由**：需每家托管额外配置 fallback，与 zip 打包目标冲突。
- **直接删 legacy/**：保留至 v2 线上稳定后再清（下个清理 PR）。
