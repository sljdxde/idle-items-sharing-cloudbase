# CONTEXT.md — 邻里好物 领域词汇

> 本文件由架构复查 + grilling 过程中沉淀的领域术语。词汇是良好 seam 的名字来源；新增/修改术语时同步更新这里。

## 产品形态

**小红书 mini-tool（离线 H5 小工具）**：整站打包为 zip 在容器 WebView 内运行，纯本地不联网。技术栈 Vue 3 + Vite + TS，孟菲斯复古拼贴设计（ADR-0002/0003）。

## 核心实体

- **Item（闲置物品）**：社区里可被借阅分享的实物，存于本机 localStorage（键 `linli_haowu_items_v1`）。
  - 字段：`id`(本机自增) / `name` / `desc` / `contact` / `building` / `imgUrl`(data:URI) / `status` / `requests[]` / `category` / `archived`
- **Category（分类）**：内容类目（home/electronics/kids/outdoor/tools/books/clothing/other）。发布时手动选择。
- **BorrowRequest（借阅申请）**：借阅人对某 Item 发起的借用意向，存于 Item 的 `requests` 数组。
  - 字段：`id` / `fromName` / `contact` / `message` / `createdAt` / `status`(pending|accepted|rejected|cancelled|returned)
- **Seed（种子数据）**：首次启动导入的 6 件示例物品（`src/lib/seed.ts`），仅本地存储为空时生效。

## 状态机

Item.status：`available → requested → borrowed → available`

- `available` — 闲置中，可被申请
- `requested` — 有 pending 借阅申请、待物主确认
- `borrowed` — 已借出
- 确认归还后回到 `available`（同一 listing 再次可借）
- **Archived（下架）**：独立布尔标记，与 status 正交；下架物品从列表隐藏但保留数据，可重新上架

## 角色

单设备单身份：使用者同时扮演物主与借阅人（数据在本机隔离）。无账号体系。

## 架构约束（来自决策）

- 纯离线：禁网络请求、禁 geolocation/clipboard/window.open 等（清单见 `.skill/references/device-capabilities.md`）；脚本必须经典外置形态。
- 数据层 seam：`src/lib/localStore.ts`（loadItems/saveItems），store 只做编排；筛选逻辑纯函数在 `src/lib/filters.ts`。
- 打包门禁：`npm run package` = 构建 + HTML 后处理 + 18 项合规扫描 + zip。见 ADR-0003。
