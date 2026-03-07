<div align="center">
  <h1>♻️ 闲置物品分享平台 (CloudBase版)</h1>
  <p>一个极简、快速、无需自建后端的同城闲置物品流转与分享网页应用。</p>
  
  <p>
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
    <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
    <img src="https://img.shields.io/badge/Tencent_CloudBase-00A4FF?style=for-the-badge&logo=tencent-qq&logoColor=white" alt="腾讯云开发">
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License">
  </p>
</div>

<hr />

## ✨ 项目简介

本项目专为托管在 **[腾讯云开发 (CloudBase)](https://cloud.tencent.com/product/tcb)** 的静态网站服务上设计，采用 **纯前端架构 (HTML + CSS + Vanilla JS)** 编写。  
目标是让你在 **0 后端代码** 的情况下，十分钟内搭建起一个允许用户发布、浏览并交流闲置物品的分享平台。

## 🌟 核心特性

- 📱 **移动端优先策略**：UI 完美适配手机、平板及桌面端浏览器，交互流畅。
- ⚡ **无框架依赖**：没有任何 React / Vue 负担，只有最原生轻量的 DOM 操作，极致的页面加载速度。
- 🖼️ **高性能图片呈现**：集成原生 `IntersectionObserver` 图片懒加载技术，滚动如丝般顺滑。
- 🛡️ **基础隐私保护**：采用“看前点击”交互，避免联系方式被恶意爬虫直接无门槛抓取。
- ☁️ **云原生集成**：全盘拥抱腾讯 Serverless 云开发，无需操心服务器运维、环境配置，开箱即用。

---

## 🛠 开发技术栈

* **核心结构**: Semantic HTML5
* **样式布局**: 原生 CSS3, Flexbox & CSS Grid, CSS Variables
* **逻辑控制**: Vanilla ECMAScript 6+ (ES6+)
* **后端支撑**: 腾讯云开发 `Web SDK (@cloudbase/js-sdk)` (数据库增删改查, 文件云存储)

---

## 🚀 部署指南 (仅需两步)

### 步骤一：云端环境准备
1. 登录 [腾讯云开发 CloudBase 控制台](https://console.cloud.tencent.com/tcb)。
2. 创建一个新环境，并记录下 **环境 ID (ENV_ID)**。
3. **数据库设置**: 新建一个名为 `items` 的数据库集合，**权限设置**为 `所有用户可读，仅创建者及管理员可写`。
4. **云存储设置**: 开启云存储，**权限设置**为 `所有用户可读，仅创建者及管理员可写`。
5. **登录鉴权**: 在 `环境设置 -> 登录授权` 中开启 **匿名登录** (便于访客静默发布)。
6. **静态网站托管**: 开启 `静态网站托管` 服务。

### 步骤二：本地代码配置与上传
1. 拉取本项目代码至本地。
2. 打开 `js/cloudbase.js` 文件，找到第一行代码：
   ```javascript
   const ENV_ID = 'YOUR_ENV_ID'; // 将这里替换为你的真实环境 ID
   ```
3. 上传代码至线上：你可以直接在控制台的“静态网站托管”界面将本项目的所有文件拖拽上传，或者使用云开发 CLI 命令行上传：
   ```bash
   tcb hosting deploy ./ / -e 你的环境ID
   ```

> **💡 本地预览测试：**
> 在上传前，您可以通过任何本地服务器进行预览测试：
> ```bash
> npx http-server ./
> # 或
> python3 -m http.server 8888
> ```

---

## 📂 目录结构

```text
├── css/
│   └── style.css       # 核心样式表 (包含响应式逻辑)
├── js/
│   ├── app.js          # 页面的 DOM 交互及视图渲染逻辑
│   └── cloudbase.js    # 腾讯云开发 SDK 接口封装 (上传/读写)
├── index.html          # 平台首页 (列表流展示)
├── publish.html        # 发布信息页 (支持图片预览和上传进度)
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
