// ================================================
// js/store.js — ItemStore 适配层（数据层 module）
// ================================================
// 方案 1（零服务器闭环）：
//   - 读取：GitHub Action 生成的同源静态 items.json（最稳），
//           失败再降级到匿名 API + 本地缓存。
//   - 写入：前端不持有任何写凭证。所有「写」都交给用户在 GitHub
//           原生界面完成 —— 发布 = 跳转预填的 Issue 创建页；
//           管理 = 跳转 GitHub 给 Issue 加/去 `lent` 标签、关闭即下架。
//           GitHub Actions 监听 issues 事件自动同步回 items.json。
//   因此这里不再有 Token、PIN、Cloudflare Worker 等概念。

const GH_OWNER = 'sljdxde';
const GH_REPO = 'idle-items-sharing-cloudbase';
const REPO = `${GH_OWNER}/${GH_REPO}`;
const REPO_URL = `https://github.com/${REPO}`;
const GH_API = `https://api.github.com/repos/${REPO}`;

const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/;

// ─── 读取 ───
// 优先级：① 同源静态快照 items.json（非空时采信，无速率限制、无 CORS）
//         ② 实时源（匿名 API，带本地缓存，易 403 仅作兜底）
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
  if (!res.ok) throw new Error(`加载失败: ${res.status}（如持续 403，请等待配额恢复）`);
  const issues = await res.json();
  return issues.map(parseIssue).filter(Boolean);
}

// 读取优先级（opts.forceLive=true 时跳过缓存与快照，直接拉实时）：
//   ① 同源静态快照 items.json —— 非空时采信（最稳）
//   ② 实时源 —— 优先复用本地缓存（5 分钟 TTL），失效再打匿名 API
//   ③ 全部失败 → 返回空数组（前端显示空状态，不再抛错中断）
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
  // ② 实时源（带本地缓存，降低限流风险）
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
    // 若 DATA 块无图，尝试从正文抓取 GitHub 图床链接
    let imgUrl = d.imgUrl || '';
    if (!imgUrl && issue.body) {
      const im = issue.body.match(/https:\/\/user-images\.githubusercontent\.com\/[^\s)>"']+/);
      if (im) imgUrl = im[0];
    }
    return {
      id: issue.number,
      name: d.name || issue.title || '未知物品',
      desc: d.desc || '',
      contact: d.contact || '',
      building: d.building || '',
      lat: d.lat || null,
      lng: d.lng || null,
      imgUrl,
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

// ─── 写入（全部走 GitHub 原生界面，前端只负责拼 URL） ───

// 构造「预填的 Issue 创建页」URL：用户登录 GitHub 后点 Submit 即上架。
function buildPublishUrl(item) {
  const title = `[闲置物品] ${item.name}`;
  const data = {
    name: item.name,
    desc: item.desc || '',
    contact: item.contact || '',
    building: item.building || '',
    lat: item.lat || null,
    lng: item.lng || null,
    imgUrl: item.imgUrl || '',
    status: 'available',
    requests: [],
    createTime: new Date().toISOString(),
  };
  const body =
`## 闲置物品：${item.name}

**描述**：${item.desc || ''}

**联系 / 位置**：${item.contact ? item.contact : (item.building ? ('楼号 ' + item.building) : '')}

> 本 Issue 由「邻里好物」创建，请勿修改下方隐藏数据块（DATA_START / DATA_END 之间）。

<!--DATA_START
${JSON.stringify(data)}
DATA_END-->`;
  const params = new URLSearchParams({ title, body, labels: 'item' });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

// 物品对应的 GitHub Issue 页（用于借阅沟通 / 物主管理）
function issueUrl(id) {
  return `${REPO_URL}/issues/${id}`;
}

// ItemStore 接口（module）：list / buildPublishUrl / issueUrl
const ItemStore = { list, buildPublishUrl, issueUrl };
