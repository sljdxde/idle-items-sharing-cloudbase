# 邻里好物 — 项目说明与提示词

一个**零服务器**的社区闲置物品分享平台：纯前端（HTML + CSS + 原生 JS）托管在 GitHub Pages，数据存于 GitHub Issues，由 GitHub Actions 自动同步为 `items.json` 静态快照。前端不持有任何写凭证——发布走预填的 GitHub Issue 创建链接，管理走 GitHub 标签（借出 / 归还）与关闭（下架）。

## 给 AI 的提示词（适配当前架构）

1. 整体架构
我有一个纯前端闲置物品分享网站，托管在 GitHub Pages。数据用 GitHub Issues 当数据库（每条物品是一条带 `item` 标签的 Issue，隐藏数据块 `<!--DATA_START ... DATA_END-->` 存 JSON），由 GitHub Actions（`sync-items.yml`）定时 + 监听 issue 事件生成同源 `items.json` 供前端读取。写操作不通过后端：发布时前端拼出 `issues/new?title=...&body=...&labels=item` 链接让用户登录 GitHub 提交；管理时物主在 GitHub 给 Issue 加 / 去 `lent` 标签（借出 / 归还）、关闭即下架。请据此给出优化建议。

2. 前端页面
用原生 HTML / CSS / JS 写一个社区闲置分享首页与发布页：首页卡片网格展示物品（图片、名称、描述、距离、状态徽标），支持按距离筛选与定位；发布页表单含物品信息、位置与联系方式、图片链接。移动端优先、无框架。

3. 同步工作流
写一个 GitHub Actions（`actions/github-script`），列出带 `item` 标签的 open issues，解析 body 中的 DATA 块为 JSON，把 `lent` 标签映射为 `borrowed` 状态，生成 `items.json` 并提交；监听 `issues` 的 opened / edited / closed / labeled / unlabeled 事件即时触发，并每 15 分钟兜底。

4. 安全与隐私
前端不持有任何 Token；发布 / 管理均经 GitHub 原生鉴权。联系方式直接展示。请给出在不引入后端的前提下保护联系方式的建议。

5. 部署
GitHub Pages（分支 master）+ Actions 自动同步，零成本、零服务器。说明上线步骤与 Action 被停用时如何恢复。
