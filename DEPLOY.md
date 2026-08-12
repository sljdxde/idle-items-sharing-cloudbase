# 部署指南（薄代理 + Pages）

本项目**无数据库、无自建服务器**：静态站点走 GitHub Pages，写操作走一个极轻的 Cloudflare Worker 代理（持有 GitHub Token，加密 PIN）。

## 第一步（安全，必做）
原 `js/github.js` 里曾硬编码一个**有仓库写权限的 Token** 并已进入公开 git 历史——它已泄露。请立即去 GitHub → Settings → Developer settings → Personal access tokens，把那个 token **吊销/轮换**。新代码已不含任何 Token。

## 第二步：准备 GitHub Token（给代理用）
在 GitHub 新建一个 **fine-grained PAT**（不要再用旧的个人令牌）：
- 仅授权本仓库 `idle-items-sharing-cloudbase`
- 权限只给 **Issues: Read and Write**，**Contents: 无**
- 复制生成的令牌备用

## 第三步：部署代理（Cloudflare Worker，免费）
```bash
npm install -g wrangler
wrangler login                      # 浏览器授权 Cloudflare
cd cloudflare-worker
wrangler secret put GITHUB_TOKEN    # 粘贴上面的 fine-grained PAT
wrangler secret put PIN_SECRET      # 任意一长串随机字符，用于加密 PIN（自己记好）
wrangler deploy
```
部署成功后得到一个地址，形如：
```
https://neighborhood-share-proxy.<你的子域>.workers.dev
```

## 第四步：把代理地址填进前端
打开 `js/store.js`，把顶部
```js
const API_PROXY = '';
```
改成
```js
const API_PROXY = 'https://neighborhood-share-proxy.<你的子域>.workers.dev';
```
提交并推送即可。**不填则浏览/读取正常，但发布与借阅等写操作会提示"代理未部署"。**

## 工作原理
- **读取物品**：浏览器无鉴权直读公开 Issue（GitHub API 允许跨域），无需 Token。
- **写操作**（发布 / 借阅申请 / 确认借出 / 确认归还 / 拒绝 / 取消 / 下架）：浏览器把请求发给代理，代理用 `GITHUB_TOKEN` 调 GitHub，并用 `PIN_SECRET` 加密管理 PIN（公开仓库只见密文）。
- 物主收到借阅申请时，代理会往对应 Issue 发一条评论，物主在 GitHub 收通知。

## 备选：Vercel 函数
若你更习惯 Vercel，可把 `cloudflare-worker/worker.js` 的逻辑改写成 `api/items.js`（Vercel Edge Function），用 `vercel env add GITHUB_TOKEN` / `PIN_SECRET` 注入密钥，部署方式类似。端点路径与请求/响应格式保持一致即可。

## 限流说明
代理内置简易内存限流（每 IP 10 分钟 30 次），冷启动会重置。生产如需严格限流，可把 `rateOk` 换成 Cloudflare KV 存储。
