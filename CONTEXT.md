# CONTEXT.md — 邻里好物 领域词汇

> 本文件由架构复查 + grilling 过程中沉淀的领域术语。词汇是良好 seam 的名字来源；新增/修改术语时同步更新这里。

## 核心实体

- **Item（闲置物品）**：社区里可被借阅分享的实物。一个 Item 对应 GitHub 仓库里一个带 `item` 标签的 Issue。
  - 字段：`id`(issue 编号) / `name` / `desc` / `contact` / `building` / `lat` / `lng` / `imgUrl` / `status` / `requests[]` / `pinCipher`
- **ItemStore**：数据层接口（module）。方法 `list() / create(item) / setStatus(id, status) / remove(id)`；由 `GitHubIssuesAdapter` 实现，Token / 编码 / labels 全藏在 adapter 内部。见 ADR-0001。
- **BorrowRequest（借阅请求）**：借阅人对某 Item 发起的借物意向，存于 Item 的 `requests` 数组。
  - 字段：`id` / `fromName`(昵称) / `contact`(微信/楼号) / `message`(留言) / `createdAt` / `status`(pending|accepted|rejected|cancelled)

## 状态机

Item.status：`available → requested → borrowed → available`

- `available` — 闲置中，可被借
- `requested` — 有人发起借阅请求、待物主确认
- `borrowed` — 已借出
- 归还后回到 `available`（即"再次分享"，复用同一 listing，无需重新发布）

## 角色

- **Owner（物主）**：Item 的发布者，凭 PIN（由代理加密存储）管理物品——确认借出 / 确认归还 / 下架。
- **Borrower（借阅人）**：轻量身份（昵称 + 联系方式），无 GitHub 账号；非 OAuth。

## 架构约束（来自决策）

- 无数据库、无自建服务器；数据走 GitHub Issues，写操作经薄 Serverless 代理（见 ADR-0001）。
- PIN 由代理加密，公开仓库只见密文，公开面无可读凭据。
