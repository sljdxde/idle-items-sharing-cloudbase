// ================================================
// cloudflare-worker/worker.js — 邻里好物 薄代理（ADR-0001）
// 持有 GitHub Token（env secret），加密 PIN，实现借阅/归还 loop 的写端点。
// 浏览器只调本代理，Token 永不进客户端。
// ================================================

let GH_TOKEN = '';
let PIN_SECRET = '';
const OWNER = 'sljdxde';
const REPO = 'idle-items-sharing-cloudbase';
const SITE_KEY_DEFAULT = 'neighborhood-share-2026';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/issues`;
const DATA_RE = /<!--DATA_START([\s\S]*?)DATA_END-->/;

// ─── 工具 ───
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-site-key',
    'Cache-Control': 'public, max-age=30', // 读缓存 30s
  };
}
function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}
function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// 简易限流（内存，冷启动会重置；生产建议换 KV）
const hits = new Map();
function rateOk(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'anon';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  if (arr.length >= 30) { hits.set(ip, arr); return false; }
  arr.push(now); hits.set(ip, arr); return true;
}

// ─── PIN 加密（AES-GCM，密钥由 PIN_SECRET 派生） ───
async function getKey() {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PIN_SECRET));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptPin(pin) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(pin));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0); combined.set(new Uint8Array(ct), iv.length);
  let bin = ''; for (const b of combined) bin += String.fromCharCode(b);
  return btoa(bin);
}
async function decryptPin(cipher) {
  const key = await getKey();
  const combined = Uint8Array.from(atob(cipher), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12); const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ─── GitHub 封装 ───
async function gh(path, method = 'GET', body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'neighborhood-proxy',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}
async function readItem(num) {
  const res = await gh(`/${num}`);
  if (!res.ok) return null;
  const issue = await res.json();
  const m = issue.body ? issue.body.match(DATA_RE) : null;
  let data = {};
  if (m && m[1]) { try { data = JSON.parse(m[1].trim()); } catch (e) { data = {}; } }
  return { issue, data, labels: (issue.labels || []).map(l => l.name) };
}
async function writeItem(num, data, labels) {
  const cur = await readItem(num);
  const oldBody = (cur && cur.issue.body) || '';
  const newData = `<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->`;
  const newBody = DATA_RE.test(oldBody) ? oldBody.replace(DATA_RE, () => newData) : oldBody + '\n\n' + newData;
  await gh(`/${num}`, 'PATCH', { body: newBody });
  if (labels) await gh(`/${num}/labels`, 'PUT', { labels });
}
async function comment(num, text) {
  await gh(`/${num}/comments`, 'POST', { body: text });
}
async function verifyPin(data, pin) {
  if (data.pinCipher) { try { return (await decryptPin(data.pinCipher)) === pin; } catch (e) { return false; } }
  if (data.pin) return data.pin === pin; // 兼容旧 item 明文 PIN
  return false;
}
function noPending(data) {
  return !((data.requests || []).some(r => r.status === 'pending'));
}

// ─── 路由 ───
export default {
  async fetch(request, env) {
    GH_TOKEN = env.GITHUB_TOKEN || '';
    PIN_SECRET = env.PIN_SECRET || 'change-me';
    const expectedSiteKey = env.SITE_KEY || SITE_KEY_DEFAULT;

    if (request.method === 'OPTIONS') return preflight();
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.headers.get('x-site-key') !== expectedSiteKey) return json(403, { error: 'site key 错误' });
    if (!rateOk(request)) return json(429, { error: '请求过于频繁，请稍后再试' });

    // ─── GET：读取物品列表（带 30s 边缘缓存，绕过匿名限流） ───
    if (request.method === 'GET' && p === '/api/items') {
      try {
        const res = await gh('?state=open&per_page=100&labels=item&sort=updated');
        if (!res.ok) return json(res.status, { error: `GitHub API 错误: ${res.status}` });
        const issues = await res.json();
        const items = issues.map(issue => {
          try {
            const m = issue.body ? issue.body.match(DATA_RE) : null;
            let d = {};
            if (m && m[1]) d = JSON.parse(m[1].trim());
            const isLentLabel = issue.labels && issue.labels.some(l => l.name === 'lent');
            return {
              id: issue.number,
              name: d.name || issue.title || '未知物品',
              desc: d.desc || '',
              contact: d.contact || '',
              building: d.building || '',
              lat: d.lat || null,
              lng: d.lng || null,
              imgUrl: d.imgUrl || '',
              status: d.status || (isLentLabel ? 'borrowed' : 'available'),
              requests: Array.isArray(d.requests) ? d.requests : [],
              pinCipher: d.pinCipher || '',
              hasLegacyPin: !!d.pin,
              createTime: issue.created_at,
            };
          } catch (e) { return null; }
        }).filter(Boolean);
        return json(200, items);
      } catch (e) {
        return json(500, { error: '读取失败: ' + e.message });
      }
    }

    if (request.method !== 'POST') return json(405, { error: '仅支持 POST' });

    let m;
    try {
      if (p === '/api/items') {
        const b = await request.json();
        if (!b.name) return json(400, { error: '缺少物品名称' });
        const data = {
          name: b.name, desc: b.desc || '', contact: b.contact || '', building: b.building || '',
          lat: b.lat || null, lng: b.lng || null, imgUrl: b.imgUrl || '',
          status: 'available', requests: [], pinCipher: b.pin ? await encryptPin(b.pin) : '',
        };
        const readable = `## 闲置物品：${b.name}\n\n**描述**：${b.desc || ''}\n\n**联系/位置**：${b.contact ? b.contact : (b.building ? ('楼号 ' + b.building) : '')}\n\n> 本 Issue 由系统自动创建，请勿修改隐藏数据！\n\n<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->`;
        const res = await gh('', 'POST', { title: `[闲置物品] ${b.name}`, body: readable, labels: ['item'] });
        if (!res.ok) { const e = await res.json().catch(() => ({})); return json(res.status, { error: e.message || '创建失败' }); }
        const created = await res.json();
        return json(200, { id: created.number });
      }

      if ((m = p.match(/^\/api\/items\/(\d+)\/request$/))) {
        const num = +m[1];
        const b = await request.json();
        const item = await readItem(num); if (!item) return json(404, { error: '物品不存在' });
        const data = item.data;
        const rid = crypto.randomUUID();
        const req = { id: rid, fromName: b.fromName || '匿名', contact: b.contact || '', message: b.message || '', createdAt: new Date().toISOString(), status: 'pending' };
        data.requests = data.requests || [];
        data.requests.push(req);
        if (data.status === 'available') data.status = 'requested';
        await writeItem(num, data, ['item']);
        await comment(num, `**${req.fromName}**${req.contact ? ('（' + req.contact + '）') : ''} 想借阅《${data.name}》：${req.message || '（无留言）'}`);
        return json(200, { id: rid });
      }

      if ((m = p.match(/^\/api\/items\/(\d+)\/confirm-borrow$/))) {
        const num = +m[1];
        const b = await request.json();
        const item = await readItem(num); if (!item) return json(404, { error: '物品不存在' });
        if (!(await verifyPin(item.data, b.pin))) return json(403, { error: '管理密码错误' });
        const req = b.requestId ? item.data.requests.find(r => r.id === b.requestId) : item.data.requests.find(r => r.status === 'pending');
        if (req) req.status = 'accepted';
        item.data.status = 'borrowed';
        await writeItem(num, item.data, ['item', 'lent']);
        return json(200, { ok: true });
      }

      if ((m = p.match(/^\/api\/items\/(\d+)\/confirm-return$/))) {
        const num = +m[1];
        const b = await request.json();
        const item = await readItem(num); if (!item) return json(404, { error: '物品不存在' });
        if (!(await verifyPin(item.data, b.pin))) return json(403, { error: '管理密码错误' });
        const req = item.data.requests.find(r => r.status === 'accepted');
        if (req) req.status = 'returned';
        item.data.status = 'available';
        await writeItem(num, item.data, ['item']);
        return json(200, { ok: true });
      }

      if ((m = p.match(/^\/api\/items\/(\d+)\/request\/([^/]+)\/cancel$/))) {
        const num = +m[1]; const rid = m[2];
        const item = await readItem(num); if (!item) return json(404, { error: '物品不存在' });
        const req = item.data.requests.find(r => r.id === rid);
        if (req) req.status = 'cancelled';
        if (noPending(item.data)) item.data.status = 'available';
        await writeItem(num, item.data, item.data.status === 'borrowed' ? ['item', 'lent'] : ['item']);
        return json(200, { ok: true });
      }

      if ((m = p.match(/^\/api\/items\/(\d+)\/request\/([^/]+)\/reject$/))) {
        const num = +m[1]; const rid = m[2];
        const b = await request.json();
        const item = await readItem(num); if (!item) return json(404, { error: '物品不存在' });
        if (!(await verifyPin(item.data, b.pin))) return json(403, { error: '管理密码错误' });
        const req = item.data.requests.find(r => r.id === rid);
        if (req) req.status = 'rejected';
        if (noPending(item.data)) item.data.status = 'available';
        await writeItem(num, item.data, ['item']);
        return json(200, { ok: true });
      }

      if ((m = p.match(/^\/api\/items\/(\d+)\/remove$/))) {
        const num = +m[1];
        const b = await request.json();
        const item = await readItem(num); if (!item) return json(404, { error: '物品不存在' });
        if (!(await verifyPin(item.data, b.pin))) return json(403, { error: '管理密码错误' });
        await gh(`/${num}`, 'PATCH', { state: 'closed' });
        return json(200, { ok: true });
      }

      return json(404, { error: '未找到接口' });
    } catch (e) {
      return json(500, { error: '服务器错误: ' + e.message });
    }
  },
};
