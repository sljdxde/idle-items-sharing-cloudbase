// ===============
// 1. 请替换为你的真实环境 ID
// ===============
const ENV_ID = 'env-1-6gx1jn85f3b12d80';

let app;
let db;

/**
 * 初始化 CloudBase (Web SDK v2)
 */
async function initCloudBase() {
  if (!app) {
    try {
      // 1. 初始化
      app = cloudbase.init({
        env: ENV_ID
      });
      // 2. 匿名登录
      const auth = app.auth({ persistence: 'local' });
      await auth.anonymousAuthProvider().signIn();
      console.log("云开发 v2 匿名登录成功");

      db = app.database();
    } catch (e) {
      console.error("SDK 加载或登录失败:", e);
    }
  }
}

/**
 * 获取云数据库中的物品列表
 * @returns {Promise<Array>}
 */
async function loadItems() {
  await ensureInit();
  try {
    const res = await db.collection('items')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get();
    return res.data;
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
  await ensureInit();
  try {
    const res = await db.collection('items').add({
      name,
      desc,
      contact,
      imgUrl,
      createTime: db.serverDate()
    });
    return res.id;
  } catch (err) {
    console.error("添加物品失败:", err);
    throw err;
  }
}

/**
 * 前端压缩图片并转为 Base64 字符串 (替代云存储方案)
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

let initPromise = null;

// 自动初始化
if (typeof cloudbase !== 'undefined') {
  initPromise = initCloudBase();
} else if (typeof tcb !== 'undefined') {
  window.cloudbase = tcb;
  initPromise = initCloudBase();
}

/**
 * 确保初始化完成的辅助函数
 */
async function ensureInit() {
  if (initPromise) {
    await initPromise;
  }
  if (!db) throw new Error("数据库未初始化");
}
