# 部署指南（零服务器方案）

本项目**无数据库、无自建服务器**：静态站点走 GitHub Pages，数据存于 GitHub Issues，同步由 GitHub Actions 完成。前端不持有任何写凭证。

## 一、安全提醒（历史遗留，必做）
原 `js/github.js` 曾硬编码一个有仓库写权限的 Token 并已进入公开 git 历史——它已泄露。请去 GitHub → Settings → Developer settings → Personal access tokens 把它**吊销 / 轮换**。当前代码已不含任何 Token。

## 二、工作原理（方案 1：纯 GitHub 闭环）
- **读取**：GitHub Actions 定时（每 15 分钟）并监听 `issues` 事件，把带 `item` 标签的 Issue 生成同源 `items.json` 静态快照；前端优先读快照（无速率限制、无 CORS），失败再降级到匿名 API + 本地缓存。
- **发布**：前端把表单拼成预填的 GitHub Issue 创建链接（`issues/new?...&labels=item`），点击后打开新标签，用户登录 GitHub 点 Submit 即上架。前端不接触任何 Token。
- **管理（借出 / 归还 / 下架）**：物主在 GitHub 给 Issue 添加 / 移除 `lent` 标签（= 借出 / 归还），关闭 Issue 即下架。Actions 监听标签与开关事件，自动同步前端状态。
- **借阅沟通**：邻里在物品卡片点「我想借」可查看物主联系方式，或在 GitHub Issue 下留言沟通。

## 三、上线步骤
1. 仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `master`，保存。
2. 确认 **Actions** 页 `Sync Items JSON` 工作流为 **Enabled**（公开仓库免费）。它会在 issue 变更时即时同步，并每 15 分钟兜底刷新。
   - 若此前因仓库长期不活跃被 GitHub 自动停用定时任务，到 Actions 页手动 **Enable** 并点一次 **Run workflow** 即可恢复。
3. 推送代码即触发 Pages 部署，稍候约 1 分钟即可访问。

## 四、图片说明
- 发布表单的「物品照片链接」填外链（图床 / 相册分享链接）即可；
- 或先发布，再在 GitHub 编辑该 Issue 上传图片（GitHub 会自动生成 `user-images.githubusercontent.com` 链接），同步时会自动抓取为封面图。

## 五、可选：前端静默写（Cloudflare Worker，非必需）
若希望发布 / 管理在前端**静默完成**、不必跳转 GitHub，可部署 `cloudflare-worker/`（持有 Token、加密 PIN）并在 `js/store.js` 顶部填 `API_PROXY`。这是方案 1 之上的增强，默认零服务器路径无需它。
