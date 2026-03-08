<div align="center">
  <h1>♻️ 闲置物品分享平台 (纯前台 Github Issues 版)</h1>
  <p>一个极简、快速、无需任何服务器和服务商注册、完全依赖 GitHub 生态的同城闲置物品流转平台。</p>
  
  <p>
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
    <img src="https://img.shields.io/badge/GitHub_Issues-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Issues">
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License">
  </p>
</div>

<hr />

## ✨ 项目简介

本项目专为追求**绝对零成本、不依赖任何云服务商注册**的用户设计。
项目采用 **纯前端架构 (HTML + CSS + Vanilla JS)** 编写，底层数据库巧妙地接入了 **GitHub Issues REST API**。它将每一条发布的闲置物品作为一条 Issue 进行保存，完全免费且永不过期。

## 🌟 核心特性

- 📱 **移动端优先策略**：UI 完美适配手机、平板及桌面端浏览器。
- ⚡ **无框架依赖**：没有任何 React / Vue 负担，只有极致的原生页面加载速度。
- 🖼️ **高性能图片呈现**：集成原生 `IntersectionObserver` 图片懒加载技术。
- ☁️ **GitHub 免费后端**：所有的数据库请求都被转化为 GitHub API 调用。发布物品即发送 Issue，拉取列表即拉取 Issues 列表。
- 📦 **魔改的高压图片直存**：突破 GitHub Issue 长度限制，通过 HTML5 前端直接将用户上传的图片超级压缩并转为 Base64 后直接存入 Issue 内容区。不用图床！不要外链！

---

## 🛠 开发技术栈

* **核心结构**: Semantic HTML5
* **样式布局**: 原生 CSS3, Flexbox & CSS Grid
* **逻辑控制**: Vanilla ECMAScript 6+
* **后端支撑**: GitHub REST API (Issues)

---

## 🚀 部署指南 (零成本两步走)

### 步骤一：创建 GitHub API 访问令牌 (Token)
1. 登录 GitHub，点击右上角头像 -> **Settings**。
2. 在左侧菜单最下方找到 **Developer settings** -> **Personal access tokens** -> **Fine-grained tokens**。
3. 点击 **Generate new token**，随意填写名称和有效期（建议设置长一点）。
4. **Repository access (仓库访问)**：选择 **Only select repositories**，并选择你用来部署这个代码的仓库名称。
5. **Permissions (权限配置)**：展开 **Repository permissions**，找到 **Issues**，将其修改为 `Read and write`（读写权限）。
6. 点击最下方生成 Token，并**复制好不要丢了**。

### 步骤二：本地代码配置与上线
1. 拉取本项目代码至本地。
2. 打开 `js/github.js` 文件，找到顶部的配置区，填入您的信息：
   ```javascript
   const GITHUB_OWNER = 'sljdxde'; // 改为您的 GitHub 用户名
   const GITHUB_REPO = 'idle-items-sharing-cloudbase'; // 改为您自己的仓库名
   const GITHUB_TOKEN = 'github_pat_xxxx_在此处粘贴刚生成的Token_xxxx'; // 填入刚才创建的 Token
   ```
3. **部署网站**: 
   直接在您的 GitHub 仓库的 **Settings -> Pages** 中，将 Source 选为 `Deploy from a branch`，Branch 选择 `master/main` 并保存。稍等片刻，您就可以得到一个免费访问的 GitHub Pages 外网域名了！

> **💡 本地预览测试：**
> 在代码推送到 GitHub 之前，您可以通过任何本地服务器进行预览测试：
> ```bash
> python3 -m http.server 8888
> ```

---

## 📂 目录结构

```text
├── css/
│   └── style.css       # 核心样式表
├── js/
│   ├── app.js          # 页面的 DOM 交互及视图渲染逻辑
│   └── github.js       # GitHub Issues REST API 封装
├── index.html          # 平台首页 
├── publish.html        # 发布信息页
├── LICENSE             # 开源协议说明
└── README.md           # 项目自述文档
```

---

## 📄 开源说明 (License)

本项目基于 **[MIT License](LICENSE)** 协议开源。
您可以自由地使用、修改和分发本项目的代码，无论是用于个人学习还是商业产品。

---
<div align="center">
  <i>Let's share perfectly good things with the world! 🌍</i>
</div>
