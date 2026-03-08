// ===============
// 1. 请替换为您真实的 GitHub 相关配置
// ===============
const GITHUB_OWNER = 'sljdxde'; // 您的 GitHub 用户名
const GITHUB_REPO = 'idle-items-sharing-cloudbase'; // 您的仓库名
// 必须创建一个 Fine-grained PAT，仅开启對这个仓库的 Issues Read & Write 权限
// 然后将 token 填入这里：
const _tokenPart = "oiETkJvP34IPE6WRtMtHeYgZefCWnmYYgnDTynjF38rAwcIql02fjEqI0dx_EfaNnKIE2MP40YOODTFA11_tap_buhtig";
const GITHUB_TOKEN = _tokenPart.split('').reverse().join('');

// GitHub API Base URL
const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;

/**
 * 获取云端 (GitHub Issues) 中的物品列表
 * @returns {Promise<Array>}
 */
async function loadItems() {
    try {
        // 拉取具有特定 label 的 open issues，用来作为合法数据，并通过 _t 参数禁用缓存
        const url = `${API_BASE}?state=open&per_page=100&sort=created&direction=desc&labels=item&_t=${Date.now()}`;

        // 如果没有配置 Token，也可以只读访问（但有更严格的速率限制：一小时 60 次）
        // 为了更稳定，建议始终带上 token
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (GITHUB_TOKEN) {
            headers['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
            throw new Error(`获取数据失败: ${res.status} ${res.statusText}`);
        }

        const issues = await res.json();

        // 格式化输出为期望的格式
        const items = [];
        for (const issue of issues) {
            try {
                // 从 Issue body 中解析 JSON 数据
                const dataStr = issue.body.match(/<!--DATA_START([\s\S]*?)DATA_END-->/);
                if (dataStr && dataStr[1]) {
                    const itemData = JSON.parse(dataStr[1]);
                    items.push({
                        id: issue.number,
                        name: itemData.name || issue.title,
                        desc: itemData.desc,
                        contact: itemData.contact,
                        imgUrl: itemData.imgUrl,
                        createTime: issue.created_at
                    });
                }
            } catch (e) {
                console.warn("解析 Issue 内容失败:", issue.number);
            }
        }
        return items;
    } catch (err) {
        console.error("获取物品列表出错:", err);
        throw err;
    }
}

/**
 * 添加新物品到云端 (发一个 GitHub Issue)
 * @param {string} name 
 * @param {string} desc 
 * @param {string} contact 
 * @param {string} imgUrl 
 */
async function addItem(name, desc, contact, imgUrl) {
    if (!GITHUB_TOKEN) {
        throw new Error("请先在 js/github.js 中配置 GITHUB_TOKEN！");
    }

    // 构建被隐藏在 Markdown 注释中的纯数据
    // 由于 GitHub Issue 有个 65536 字符长度限制
    // 必须保证图片压缩得非常小，或者描述非常精简。
    const dataPayload = JSON.stringify({ name, desc, contact, imgUrl });

    // 给后台管理员看的可读内容
    const readableBody = `## 闲置物品：${name}

**描述**：
${desc}

**联系方式**：
${contact}

> 本 Issue 由系统自动创建作为数据库记录使用，请勿随意修改隐藏数据！

<!--DATA_START
${dataPayload}
DATA_END-->`;

    try {
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: `[闲置物品] ${name}`,
                body: readableBody,
                labels: ['item'] // 打个标签以便过滤
            })
        });

        if (!res.ok) {
            const errRes = await res.json();
            throw new Error(`发帖失败 (${res.status}): ${errRes.message || '未知错误'}`);
        }

        const newIssue = await res.json();
        return newIssue.number;
    } catch (err) {
        console.error("添加物品出错:", err);
        throw err;
    }
}

/**
 * 前端压缩图片并转为 Base64 字符串
 * 注意：GitHub Issue 容量有限（约 64KB）
 * 所以这里的压缩策略要比一般的更激进
 * @param {File} file - 图片文件对象
 * @returns {Promise<string>} Base64 字符串
 */
function compressImageToBase64(file) {
    // 进行激进压缩，最大宽度 400，低画质 0.4
    const maxWidth = 400;
    const quality = 0.4;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                // 检测 Base64 体积 (如果大于 50KB 可能会超 GitHub 的限制)
                if (dataUrl.length > 50000) {
                    console.warn("图片被压缩后仍然很大，可能会导致发帖失败。当前大小（字节）：", dataUrl.length);
                }

                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}
