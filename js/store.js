// ================================================
// js/store.js — ItemStore 适配层（数据层 module）
// ================================================
// 业务层只依赖下面这个「小接口」；GitHub 的细节与 Token 全部藏在
// GitHubIssuesAdapter 内部（这里拆成了「浏览器直读」+「薄代理写」）。
//
//   - 读取：无鉴权 GET 公开 issue（GitHub API 允许浏览器跨域直读）
//   - 写入：薄 Serverless 代理 API_PROXY（持有 Token，见 ADR-0001 / DEPLOY.md）
//
// 这样 Token 永不进客户端，PIN 由代理加密（pinCipher），公开面无可读凭据。

const GH_OWNER = 'sljdxde';
const GH_REPO = 'idle-items-sharing-cloudbase';
const GH_API = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}`;

// 站点 key：仅挡普通爬虫，非真安全。需与代理端一致。
const SITE_KEY = 'neighborhood-share-2026';

// 部署 Cloudflare Worker 后把地址填到这里（见 DEPLOY.md）。为空时写入功能不可用。
const API_PROXY = '';

const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/;

function proxyReady() { return !!API_PROXY; }

// ─── 代理调用（写入统一走这里） ───
async function proxyFetch(path, body) {
  if (!proxyReady()) {
    throw new Error('代理未部署：写入功能暂不可用。请按 DEPLOY.md 部署 Cloudflare Worker 后填入 API_PROXY。');
  }
  const res = await fetch(`${API_PROXY}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-site-key': SITE_KEY },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    let msg = `操作失败 (${res.status})`;
    try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (_) {}
    throw new Error(msg);
  }
  return res.json().catch(() => ({}));
}

// ─── 读取 ───
// 优先级：① 同源静态快照 items.json（GitHub Action 定时生成，无速率限制、无 CORS）
//         ② 代理 GET /api/items（若已部署 Worker）
//         ③ 匿名直连 GitHub API（60/hr 限制，易 403，仅作最后兜底）
// 浏览器本地缓存：降低匿名 API 限流（共享 IP）命中概率
const LIST_CACHE_KEY = 'ns_list_cache';
const LIST_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function readListCache() {
  try {
    const raw = localStorage.getItem(LIST_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (typeof c.t === 'number' && Date.now() - c.t < LIST_CACHE_TTL && Array.isArray(c.data)) return c.data;
  } catch (_) {}
  return null;
}
function writeListCache(arr) {
  try { localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ t: Date.now(), data: arr })); } catch (_) {}
}

// 实时从 GitHub 匿名 API 读取（易 403，作为兜底实时源）
async function listFromApi() {
  const url = `${GH_API}/issues?state=open&per_page=100&labels=item&sort=updated`;
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error(`加载失败: ${res.status}（如持续 403，请等待配额恢复或部署代理）`);
  const issues = await res.json();
  return issues.map(parseIssue).filter(Boolean);
}

// 读取优先级（可在 opts.forceLive=true 时跳过缓存，直接拉实时）：
//   ① 同源静态快照 items.json —— 非空时采信（无速率限制、无 CORS，最稳）
//   ② 代理 GET /api/items（若已部署 Worker）
//   ③ 实时源 —— 优先复用本地缓存（5 分钟 TTL），失效再打匿名 API
//   ④ 全部失败 → 返回空数组（前端显示空状态，不再抛错中断）
async function list(opts) {
  const forceLive = !!(opts && opts.forceLive);

  // ① 同源静态快照
  if (!forceLive) {
    try {
      const res = await fetch(`items.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const arr = await res.json();
        // 仅当非空才采信；空快照说明 Action 未同步或暂无数据，继续走实时源
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch (e) {
      console.warn('items.json 读取失败，尝试降级:', e.message);
    }
  }
  // ② 代理（若已部署）
  if (!forceLive && proxyReady()) {
    try {
      const res = await fetch(`${API_PROXY}/api/items`, {
        headers: { 'Accept': 'application/json', 'x-site-key': SITE_KEY },
      });
      if (res.ok) return await res.json();
      console.warn('代理读取失败，降级直连:', res.status);
    } catch (e) {
      console.warn('代理不可达，降级直连:', e.message);
    }
  }
  // ③ 实时源（带本地缓存，降低限流风险）
  try {
    if (!forceLive) {
      const cached = readListCache();
      if (cached) return cached;
    }
    const live = await listFromApi();
    writeListCache(live);
    return live;
  } catch (e) {
    console.warn('实时读取失败，返回空列表:', e.message);
    return [];
  }
}

// 把 GitHub Issue 解析成 Item（兼容旧 item：lent 标签=borrowed、明文 pin）
function parseIssue(issue) {
  try {
    const m = issue.body ? issue.body.match(DATA_RE) : null;
    let d = {};
    if (m && m[1]) d = JSON.parse(m[1].trim());
    const isLentLabel = issue.labels && issue.labels.some(l => l.name === 'lent');
    const status = d.status || (isLentLabel ? 'borrowed' : 'available');
    return {
      id: issue.number,
      name: d.name || issue.title || '未知物品',
      desc: d.desc || '',
      contact: d.contact || '',
      building: d.building || '',
      lat: d.lat || null,
      lng: d.lng || null,
      imgUrl: d.imgUrl || '',
      status,                                  // available | requested | borrowed
      requests: Array.isArray(d.requests) ? d.requests : [],
      pinCipher: d.pinCipher || '',
      hasLegacyPin: !!d.pin,
      createTime: issue.created_at,
    };
  } catch (e) {
    console.warn('解析失败', issue.number, e);
    return null;
  }
}

// ─── 写入（全部走代理；代理持有 Token 并加密 PIN） ───
function create(item) {
  return proxyFetch('/api/items', {
    name: item.name, desc: item.desc, contact: item.contact, building: item.building,
    lat: item.lat, lng: item.lng, imgUrl: item.imgUrl, pin: item.pin,
  }).then(r => r.id);
}
function requestBorrow(id, req) {
  return proxyFetch(`/api/items/${id}/request`, req);
}
function confirmBorrow(id, pin, requestId) {
  return proxyFetch(`/api/items/${id}/confirm-borrow`, { pin, requestId: requestId || null });
}
function confirmReturn(id, pin) {
  return proxyFetch(`/api/items/${id}/confirm-return`, { pin });
}
function rejectRequest(id, requestId, pin) {
  return proxyFetch(`/api/items/${id}/request/${requestId}/reject`, { pin });
}
function cancelRequest(id, requestId) {
  return proxyFetch(`/api/items/${id}/request/${requestId}/cancel`, {});
}
function remove(id, pin) {
  return proxyFetch(`/api/items/${id}/remove`, { pin });
}

// ItemStore 接口（module）：list / create / requestBorrow / confirmBorrow /
// confirmReturn / rejectRequest / cancelRequest / remove
const ItemStore = {
  list, create, requestBorrow, confirmBorrow, confirmReturn,
  rejectRequest, cancelRequest, remove, proxyReady,
};

// ─── 前端图片压缩（发布页与卡片共用） ───
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
