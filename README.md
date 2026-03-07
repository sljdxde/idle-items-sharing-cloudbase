# 闲置物品分享平台 - 云开发 (CloudBase) 版

本项目是一个极简的闲置物品分享前端页面，专为托管在腾讯云开发 (CloudBase) 静态网站上设计，基于纯 HTML + CSS + Vanilla JS 编写。

## ✨ 特性
- 📱 **移动端优先与响应式设计**：使用 CSS Grid 和 Flexbox 构建，自适应所有设备屏幕。
- ⚡ **轻量与快速**：纯原生代码，不依赖任何如 React/Vue 或 jQuery 这样的大型框架，仅引入 CloudBase Web SDK。
- 🖼️ **图片懒加载**：使用 `IntersectionObserver` 优化长列表浏览体验。
- 🛡️ **基础防爬机制**：采用点击后显示联系方式的交互策略，增加基本的数据保护。

## 🚀 部署步骤

### 1. 腾讯云控制台准备
1. 登录 [腾讯云开发 CloudBase 控制台](https://console.cloud.tencent.com/tcb)。
2. 创建一个新的环境，记录下 **环境 ID** (ENV_ID)。
3. 在左侧菜单找到**数据库**，新建一个集合，命名为 `items`。将该集合的数据权限设置为 **所有用户可读，仅创建者及管理员可写**。
4. 在左侧菜单找到**云存储**，确保权限设置为 **所有用户可读，仅创建者及管理员可写**。
5. 在左侧菜单找到**环境设置 -> 登录授权**，开启 **匿名登录**。以支持前端无密调用。
6. 在左侧菜单找到**静态网站托管**，并开启该服务。

### 2. 本地项目配置
打开 `js/cloudbase.js` 文件，找到第一行：
```javascript
const ENV_ID = 'YOUR_ENV_ID'; // 将 YOUR_ENV_ID 替换为你的真实环境 ID
```

### 3. 本地预览
你可以使用任何简单的静态服务器来预览：
```bash
# 如果有 python
python -m http.server 8000
# 或者使用 Node.js 的 http-server
npx http-server
```
打开 `http://localhost:8000` 即可调试。

### 4. 发布到线上环境
将此项目的所有文件（包括 `index.html`, `publish.html`, `css/` 和 `js/` 文件夹）上传到腾讯云开发的 **静态网站托管** 的根目录中。
您可以直接在控制台操作，或者使用 CloudBase CLI 工具批量上传：
```bash
tcb hosting deploy ./ / -e 你的环境ID
```
