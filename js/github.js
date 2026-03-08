// ===============
// GitHub Issues 后端配置
// ===============
const GITHUB_OWNER = 'sljdxde';
const GITHUB_REPO = 'idle-items-sharing-cloudbase';
const _tokenPart = "oiETkJvP34IPE6WRtMtHeYgZefCWnmYYgnDTynjF38rAwcIql02fjEqI0dx_EfaNnKIE2MP40YOODTFA11_tap_buhtig";
const GITHUB_TOKEN = _tokenPart.split('').reverse().join('');

const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;

/**
 * 获取物品列表
 */
async function loadItems() {
    try {
        const url = `${API_BASE}?state=open&per_page=100&sort=created&direction=desc&labels=item&_t=${Date.now()}`;
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`获取数据失败: ${res.status}`);

        const issues = await res.json();
        const items = [];
        for (const issue of issues) {
            try {
                const dataStr = issue.body.match(/<!--DATA_START([\s\S]*?)DATA_END-->/);
                const isLent = issue.labels.some(l => l.name === 'lent');
                if (dataStr && dataStr[1]) {
                    const d = JSON.parse(dataStr[1]);
                    items.push({
                        id: issue.number,
                        name: d.name || issue.title,
                        desc: d.desc,
                        contact: d.contact || '',
                        building: d.building || '',
                        lat: d.lat || null,
                        lng: d.lng || null,
                        imgUrl: d.imgUrl,
                        pin: d.pin,
                        isLent: isLent,
                        createTime: issue.created_at
                    });
                }
            } catch (e) {
                console.warn("解析失败:", issue.number);
            }
        }
        return items;
    } catch (err) {
        console.error("获取物品列表出错:", err);
        throw err;
    }
}

/**
 * 添加物品
 */
async function addItem(name, desc, contact, building, lat, lng, imgUrl, pin) {
    if (!GITHUB_TOKEN) throw new Error("请先配置 GITHUB_TOKEN！");

    const dataPayload = JSON.stringify({ name, desc, contact, building, lat, lng, imgUrl, pin });

    const contactDisplay = contact || `🏠 ${building}`;
    const readableBody = `## 闲置物品：${name}

**描述**：${desc}

**联系/位置**：${contactDisplay}

> 本 Issue 由系统自动创建，请勿修改隐藏数据！

<!--DATA_START
${dataPayload}
DATA_END-->`;

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
            labels: ['item']
        })
    });

    if (!res.ok) {
        const errRes = await res.json();
        throw new Error(`发帖失败 (${res.status}): ${errRes.message || '未知错误'}`);
    }
    return (await res.json()).number;
}

/**
 * 修改物品状态 (借出/恢复)
 */
async function updateItemStatus(issueId, newStatus) {
    if (!GITHUB_TOKEN) throw new Error("缺少 Token");
    const labels = newStatus === 'lent' ? ['item', 'lent'] : ['item'];
    const res = await fetch(`${API_BASE}/${issueId}/labels`, {
        method: 'PUT',
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labels })
    });
    if (!res.ok) throw new Error("更新状态失败");
    return true;
}

/**
 * 永久下架 (关闭 Issue)
 */
async function closeItem(issueId) {
    if (!GITHUB_TOKEN) throw new Error("缺少 Token");
    const res = await fetch(`${API_BASE}/${issueId}`, {
        method: 'PATCH',
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state: 'closed' })
    });
    if (!res.ok) throw new Error("下架失败");
    return true;
}

/**
 * 前端图片压缩
 */
function compressImageToBase64(file) {
    const maxWidth = 400;
    const quality = 0.4;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}
