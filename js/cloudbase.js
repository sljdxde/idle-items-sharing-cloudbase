// ===============
// 1. 请替换为你的真实环境 ID
// ===============
const ENV_ID = 'env-1-6gx1jn85f3b12d80';

let app;
let db;

/**
 * 初始化 CloudBase
 */
function initCloudBase() {
  if (!app) {
    try {
      // 1. 初始化
      app = cloudbase.init({
        env: ENV_ID
      });
      // 2. 匿名登录 (应用级)
      app.auth({ persistence: 'local' }).anonymousAuthProvider().signIn().then(() => {
        console.log("云开发匿名登录成功");
      }).catch(err => {
        console.error("云开发登录失败:", err);
      });

      db = app.database();
    } catch (e) {
      console.error("SDK 加载或初始化失败:", e);
    }
  }
}

/**
 * 获取云数据库中的物品列表
 * @returns {Promise<Array>}
 */
async function loadItems() {
  if (!db) return [];
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
  if (!db) throw new Error("数据库未初始化");
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
 * 上传图片到云存储
 * @param {File} file - 图片文件对象
 * @param {Function} onProgress - 进度回调 (0-100)
 * @returns {Promise<string>} 图片下载链接
 */
async function uploadImage(file, onProgress) {
  if (!app) throw new Error("CloudBase 未初始化");

  // 生成随机文件名，避免重名
  const ext = file.name.split('.').pop() || 'png';
  const fileName = `images/${Date.now()}_${Math.random().toString(36).substring(2)}.${ext}`;

  try {
    // 1. 上传文件
    await app.uploadFile({
      cloudPath: fileName,
      filePath: file,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total > 0) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress(percent);
        }
      }
    });

    // 2. 获取临时下载链接 (如果你配置了云存储公开访问，也可以直接拼接云存储域名)
    const res = await app.getTempFileURL({
      fileList: [fileName]
    });

    if (res.fileList && res.fileList.length > 0) {
      return res.fileList[0].tempFileURL;
    } else {
      throw new Error("获取图片链接失败");
    }
  } catch (err) {
    console.error("上传图片失败:", err);
    throw err;
  }
}

// 自动初始化
// 注意：如果页面上没有引入 cloudbase-js-sdk，这里会抛错并被 catch 捕获
// 我们在 HTML 中使用了 tcb.js 或者 cloudbase.full.js
if (typeof cloudbase !== 'undefined') {
  initCloudBase();
} else if (typeof tcb !== 'undefined') {
  // 兼容老版本 tcb 对象
  window.cloudbase = tcb;
  initCloudBase();
}
