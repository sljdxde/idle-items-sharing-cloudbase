<div align="center">
  <h1>♻️ 闲置物品分享平台 (纯前台 Serverless 版)</h1>
  <p>一个极简、快速、无需自建后端、完全免费的同城闲置物品流转与分享网页应用。</p>
  
  <p>
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
    <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
    <img src="https://img.shields.io/badge/LeanCloud-00A4FF?style=for-the-badge&logo=linux&logoColor=white" alt="LeanCloud">
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License">
  </p>
</div>

<hr />

## ✨ 项目简介

本项目专为**无服务器 (Serverless)** 和**绝对零成本**运营而设计，采用 **纯前端架构 (HTML + CSS + Vanilla JS)** 编写。  
默认对接 **LeanCloud** 的永久免费版对象存储服务。十分钟内即可搭建起一个允许用户发布、浏览并交流闲置物品的分享平台。

## 🌟 核心特性

- 📱 **移动端优先策略**：UI 完美适配手机、平板及桌面端浏览器，交互流畅。
- ⚡ **无框架依赖**：没有任何 React / Vue 负担，只有最原生轻量的 DOM 操作，极致的页面加载速度。
- 🖼️ **高性能图片呈现**：集成原生 `IntersectionObserver` 图片懒加载技术，滚动如丝般顺滑。
- 🛡️ **基础隐私保护**：采用“看前点击”交互，避免联系方式被恶意爬虫直接无门槛抓取。
- ☁️ **永久免费后端**：采用 LeanCloud 国际版作为对象数据库，图片在前端自动无损/有损 Base64 压缩直存，彻底告别云存储收费烦恼！

---

## 🛠 开发技术栈

* **核心结构**: Semantic HTML5
* **样式布局**: 原生 CSS3, Flexbox & CSS Grid, CSS Variables
* **逻辑控制**: Vanilla ECMAScript 6+ (ES6+)
* **后端支撑**: LeanCloud JavaScript SDK (`av-min.js`) (数据对象增删改查)

---

## 🚀 部署指南 (零成本两步走)

### 步骤一：LeanCloud 后端准备
1. 访问并注册 [LeanCloud 国际版 (https://leancloud.app/)](https://leancloud.app/)（开发版节点永久免费，不需绑卡）。
2. 在控制台创建一个新应用（App）。
3. 进入 **设置 -> 应用 Keys**，记录下你的 `App ID` 和 `App Key`。
4. 进入 **数据存储 -> 结构化数据**，可以不用提前建表，代码将自动创建名为 `Item` 的 Class。为了安全，建议你稍后在权限设置中把 `Item` 类的写入权限设置为 `任意用户可写`，删除/修改权限设为 `仅创建者`。

### 步骤二：本地代码配置与上线
1. 拉取本项目代码至本地。
2. 打开 `js/leancloud.js` 文件，找到顶部代码并替换为你自己的 Key：
   ```javascript
   const APP_ID = 'YOUR_LEANCLOUD_APP_ID';
   const APP_KEY = 'YOUR_LEANCLOUD_APP_KEY';
   ```
3. **部署网站**: 
   由于这已经是纯纯的静态网页了，你可以一键把它白嫖部署到任何静态空间，比如：
   - GitHub Pages (最简单)
   - Vercel
   - Netlify
   - Cloudflare Pages

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
│   └── leancloud.js    # LeanCloud SDK 接口封装 (读写与前端 Base64 图片压缩)
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
