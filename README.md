<div align="center">
  <h1>闲置物品分享平台 (纯前台 Github Issues 版)</h1>
  <p>一个极简、快速、无需任何服务器和服务商注册、完全依赖 GitHub 生态的同城闲置物品流转平台。</p>

  <p>
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
    <img src="https://img.shields.io/badge/GitHub_Issues-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Issues">
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License">
  </p>
</div>

<hr />

## 项目简介

本项目专为追求**绝对零成本、不依赖任何云服务商注册**的用户设计。
项目采用 **纯前端架构 (HTML + CSS + Vanilla JS)** 编写，底层数据巧妙地接入了 **GitHub Issues REST API**。它将每一条发布的闲置物品作为一条 Issue 进行保存，完全免费且永不过期。

## 核心特性

- **移动端优先策略**：UI 完美适配手机、平板及桌面端浏览器。
- **无框架依赖**：没有任何 React / Vue 负担，只有极致的原生页面加载速度。
- **高性能图片呈现**：集成原生 `IntersectionObserver` 图片懒加载技术。
- **GitHub 免费后端**：所有的数据请求都被转化为 GitHub API 调用。发布物品即发送 Issue，拉取列表即拉取 Issues 列表。
- **图片外链优先**：发布表单支持粘贴图片链接；也可发布后在 GitHub 编辑上传图片，由 Actions 自动抓取为封面。

---

## 开发技术栈

* **核心结构**: Semantic HTML5
* **样式布局**: 原生 CSS3, Flexbox & CSS Grid
* **逻辑控制**: Vanilla ECMAScript 6+
* **后端支撑**: GitHub Issues + GitHub Actions 自动同步（零服务器）

---

## 部署指南 (零成本两步走)

### 步骤一：开启 Pages 与同步
1. 拉取本项目代码至本地（或直接在 GitHub 网页编辑）。
2. 仓库 **Settings -> Pages**：Source 选 `Deploy from a branch`，Branch 选 `master` 并保存，即可得到免费可访问的 GitHub Pages 外网域名。
3. 确认 **Actions** 页 `Sync Items JSON` 工作流为 **Enabled**（公开仓库免费）。它会在 Issue 变更时即时同步，并每 15 分钟兜底；若曾被停用，手动 Enable 并 Run workflow 一次即可恢复。

### 步骤二：发布与管理（零服务器）
- **发布**：打开 `publish.html` 填表，提交后会跳转 GitHub 预填发布页，登录后点 Submit 即上架，本站自动同步展示。
- **管理**：物主在 GitHub 给对应 Issue 添加 / 移除 `lent` 标签表示借出 / 归还，关闭 Issue 即下架。详见 `DEPLOY.md`。

> **本地预览测试：**
> 在代码推送到 GitHub 之前，可以通过任何本地服务器进行预览测试：
> ```bash
> python3 -m http.server 8888
> ```

---

## 目录结构

```text
├── css/
│   └── style.css       # 核心样式表（设计系统 v5）
├── js/
│   ├── app.js          # 页面的 DOM 交互及视图渲染逻辑
│   └── store.js        # 数据存储适配层（ItemStore + GitHubIssuesAdapter）
├── cloudflare-worker/  # 可选：前端静默写代理（非必需）
├── .github/workflows/  # 定时生成 items.json 快照
├── index.html          # 平台首页
├── publish.html        # 发布信息页
├── DEPLOY.md           # 代理部署说明
├── LICENSE             # 开源协议说明
└── README.md           # 项目自述文档
```

---

## 开源说明 (License)

本项目基于 **[MIT License](LICENSE)** 协议开源。
您可以自由地使用、修改和分发本项目的代码，无论是用于个人学习还是商业产品。

---

<div align="center">
  <i>Let's share perfectly good things with the world.</i>
</div>
