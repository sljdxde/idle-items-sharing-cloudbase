# NOTES.md — 用户世界笔记

> /loop-me 工作区原始笔记：记录老大的世界——工具、通道、术语。模糊术语在此锐化为规范词。

## 项目
- **邻里好物**：社区闲置互助 / 借阅分享平台。纯前端（HTML/CSS/JS），无数据库、无服务器。
- 数据后端 = GitHub Issues（每个物品一个带 `item` 标签的 Issue）。
- 写操作经薄 Serverless 代理（Cloudflare Worker / Vercel Function）持有 GitHub Token（ADR-0001）。

## 工具 / 通道
- **GitHub Issues**：物品存储 + 物主通知（代理发 Issue 评论 → 物主收 GitHub 通知）。
- **GitHub Token**：仅存于代理 env，不进客户端。
- **`gh` CLI**：issue tracker 约定（见 docs/agents/issue-tracker.md）。
- **定位**：浏览器 geolocation + Nominatim 反向地理编码 + OSM 嵌入地图。
- **图片**：前端压缩为 base64 存 issue body（候选⑥待优化，避免撑爆 issue）。

## 术语（用户 / 产品侧）
- 闲置物品、发布、借阅、归还、再分享、管理 PIN。
- "我想借" = 发起借阅请求；"确认借出" / "确认归还" = 物主 PIN 操作。

## 用户偏好
- 老大沟通轻松随意；grilling 中一路采纳推荐项（决策高效）。
- 硬约束：无数据库、无服务器，全部走 GitHub。
