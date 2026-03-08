// ===============
// 1. 请替换为你的真实 LeanCloud App ID 和 App Key
// ===============
const APP_ID = 'YOUR_LEANCLOUD_APP_ID';
const APP_KEY = 'YOUR_LEANCLOUD_APP_KEY';
// 如果用的是国际版，通常不需要配置 Server URL。但如果是带区域的特殊版本，可以放开下面这个注释并填入：
// const SERVER_URL = 'https://YOUR_API_CUSTOM_DOMAIN';

let isInitialized = false;

/**
 * 初始化 LeanCloud SDK
 */
function initLeanCloud() {
    if (!isInitialized && typeof AV !== 'undefined') {
        try {
            AV.init({
                appId: APP_ID,
                appKey: APP_KEY,
                // serverURL: SERVER_URL
            });
            console.log("LeanCloud 初始化成功");
            isInitialized = true;
        } catch (e) {
            console.error("LeanCloud 初始化失败:", e);
        }
    }
}

/**
 * 确保初始化完成的辅助函数
 */
function ensureInit() {
    if (!isInitialized) {
        throw new Error("LeanCloud 未初始化，请检查 App ID / App Key 或网络连接。");
    }
}

/**
 * 获取云数据库中的物品列表
 * @returns {Promise<Array>}
 */
async function loadItems() {
    ensureInit();
    try {
        const query = new AV.Query('Item');
        query.descending('createdAt'); // 按创建时间倒序
        query.limit(100);             // 限制 100 条
        const results = await query.find();

        // 格式化输出为与旧版 app.js 一致的格式
        return results.map(item => ({
            id: item.id,
            name: item.get('name'),
            desc: item.get('desc'),
            contact: item.get('contact'),
            imgUrl: item.get('imgUrl'),
            createTime: item.createdAt
        }));
    } catch (err) {
        console.error("获取物品列表失败:", err);
        throw err;
    }
}

/**
 * 添加新物品到云数据库
 * @param {string} name 
 * @param {string} desc 
 * @param {string} contact 
 * @param {string} imgUrl 
 */
async function addItem(name, desc, contact, imgUrl) {
    ensureInit();
    try {
        // 声明 class
        const ItemClass = AV.Object.extend('Item');
        // 构建对象
        const _item = new ItemClass();
        _item.set('name', name);
        _item.set('desc', desc);
        _item.set('contact', contact);
        _item.set('imgUrl', imgUrl);

        // 保存到云端
        const savedItem = await _item.save();
        return savedItem.id;
    } catch (err) {
        console.error("添加物品失败:", err);
        throw err;
    }
}

/**
 * 前端压缩图片并转为 Base64 字符串 (免费存储方案核心)
 * @param {File} file - 图片文件对象
 * @param {number} maxWidth - 最大宽度 (默认 800)
 * @param {number} quality - 压缩质量 (0-1，默认 0.6)
 * @returns {Promise<string>} Base64 字符串
 */
function compressImageToBase64(file, maxWidth = 800, quality = 0.6) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // 等比例缩放计算
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                // 绘制白色背景（防止透明PNG转JPG变黑）
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.drawImage(img, 0, 0, width, height);

                // 导出压缩后的 dataURL，统一为 jpeg 减小体积
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// 自动初始化
if (typeof AV !== 'undefined') {
    initLeanCloud();
}
