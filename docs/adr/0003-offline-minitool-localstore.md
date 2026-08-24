# ADR-0003: 去 GitHub 化 — 本地优先数据层与小红书小工具合规

- **状态**：Accepted
- **日期**：2026-08-24
- **关联**：ADR-0001（Serverless 写代理，随本决策一并搁置）、ADR-0002（Vue3/Memphis 方向延续）

## Context（背景）

产品目标变更为**小红书 mini-tool（离线 H5 小工具）**。容器约束（`.skill/references/`）：

1. **纯本地不联网**：禁 fetch/XHR/一切外部资源；数据只能 localStorage/IndexedDB 或包内 JSON。
2. **能力收紧**：geolocation、clipboard API、window.open/target=_blank 全部禁用。
3. **CSP**：脚本必须经典外置（无 `type="module"`、无内联 script、无行内事件）。

原 v2 架构的 GitHub Issues 数据库、三级降级读取、预填 Issue 写路径、定位距离筛选在此容器内**全部不可运行**。

## Decision（决策）

### 数据层：localStorage 自持（`src/lib/localStore.ts`）
- 单一存储键 `linli_haowu_items_v1`；首启导入种子数据（`seed.ts`，6 件示例物品），此后完全以用户数据为准。
- 写路径站内闭环：发布=直接创建记录；借阅=`requests[]` 推入 pending 申请并置 `requested`；确认借出→`borrowed`；归还→`available`（同一 listing 复用）；下架=`archived:true` 可逆隐藏；删除=物理移除。
- 完整状态机 `available ⇄ requested → borrowed → available` 首次全部可达（GitHub 版的 requested 无写入端）。
- 配额失败兜底：内存生效 + Toast 警告。

### 能力替代
| 移除 | 替代 |
|---|---|
| geolocation 定位 + 距离筛选 | 搜索（名称/描述/楼号）+ 分类 + 最新排序 |
| GitHub Issue 评论沟通 | 站内借阅申请表单 |
| 图片外链/图床 | `<input type=file>` + canvas 压缩为 data:URI 内嵌 |
| window.open 发布跳转 | 表单直发 |

### 构建形态
- Rollup 输出 **IIFE 单包**（`inlineDynamicImports`），路由改静态导入。
- `scripts/fix-dist-html.mjs` 剥离 Vite 入口的 `type="module"/crossorigin` 并**补 `defer`**（module 默认延迟执行，经典脚本不加 defer 会先于 `#app` 执行导致挂载失败——E2E 自检抓出）。
- CSS 由构建期注入 JS、运行时生成 `<style>`（容器允许内联样式）。
- 字体弃 Google Fonts，全系统栈（宋体衬线保留孟菲斯气质）。
- 一键管线 `npm run package`：typecheck → build → HTML 后处理 → `check-minitool.mjs` 门禁扫描（SKILL.md 清单落地为 18 项断言）→ zip（index.html 在根）。

## Consequences（后果）

**正面**
- 产物 `linli-haowu-minitool.zip` ≈58KB，零网络依赖，PC 模拟器/真机行为一致；单测 19 例覆盖本地状态机契约。
- 「用户隔离」问题消解为「设备即身份」：数据按小工具实例隔离在用户本机，无隐私外泄面。

**负面 / 代价**
- 多设备不同步、无社区共享——本质变为单机应用；若未来要共享需自建后端重新引入网络层（ADR-0001 的 Worker 设计可复用）。
- 定位/距离功能整体下线。
- localStorage 不保证永久持久化（容器可清理），重要数据依赖用户主动留存。

## 备选（被否决）
- **@vitejs/plugin-legacy**：注入 SystemJS 与检测内联脚本，撞 CSP 内联禁令。
- **包内 items.json + 启动 fetch**：仍属资源加载且无写回路径，不如 localStorage 直接。
