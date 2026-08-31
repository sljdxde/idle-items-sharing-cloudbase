// ================================================
// cloudflare-worker/worker.js — 邻里好物 薄代理（ADR-0001）
// 持有 GitHub Token（env secret），浏览器只调 /api/*，Token 永不进客户端。
// Issue 写入格式与 scripts/gen-items.mjs / handle-comment.mjs 严格一致：
//   - title：`[闲置物品] 名称`
//   - labels：item 必备；借出加 lent（POST /labels），归还删 lent（DELETE /labels/lent）
//   - state：closed = 已下架，open = 在架
//   - body：含 <!--DATA_START\n{json}\nDATA_END--> 隐藏数据块
// 鉴权：x-site-key 头（挡普通爬虫）+ 手机号匹配（物主/借阅人）；按 IP 限流。
// ================================================

let GH_TOKEN = '';
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
    'Cache-Control': 'no-store',
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
  arr.push(now); hits.set(ip, arr);
  return true;
}

// ─── GitHub 封装 ───
async function gh(path, method = 'GET', body) {
  return fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'neighborhood-proxy',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function extractData(body) {
  const m = body ? body.match(DATA_RE) : null;
  if (!m || !m[1]) return {};
  try { return JSON.parse(m[1].trim()); } catch (e) { return {}; }
}

/** Issue → Item（与 src/lib/github.ts parseIssue / scripts/gen-items.mjs 同构） */
function toItem(issue) {
  const d = extractData(issue.body);
  const isLent = (issue.labels || []).some(l => l.name === 'lent');
  return {
    id: issue.number,
    name: typeof d.name === 'string' && d.name.trim() ? d.name : String(issue.title || '').replace(/^\[闲置物品\]\s*/, '').trim() || '未命名物品',
    desc: typeof d.desc === 'string' ? d.desc : '',
    contactType: d.contactType === 'building' ? 'building' : 'phone',
    contact: typeof d.contact === 'string' ? d.contact : '',
    imgUrl: typeof d.imgUrl === 'string' ? d.imgUrl : '',
    status: isLent ? 'lent' : 'available',
    borrowedBy: typeof d.borrowedBy === 'string' ? d.borrowedBy : undefined,
    borrowedAt: typeof d.borrowedAt === 'string' ? d.borrowedAt : undefined,
    ownerPhone: typeof d.ownerPhone === 'string' ? d.ownerPhone : '',
    lat: typeof d.lat === 'number' && Number.isFinite(d.lat) ? d.lat : null,
    lng: typeof d.lng === 'number' && Number.isFinite(d.lng) ? d.lng : null,
    category: typeof d.category === 'string' ? d.category : 'other',
    createTime: typeof d.createTime === 'string' ? d.createTime : (issue.created_at || new Date().toISOString()),
    archived: issue.state === 'closed',
  };
}

/** 把 data 写回 body 的 DATA 块（无块则追加） */
function withDataBlock(oldBody, data) {
  const block = `<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->`;
  return DATA_RE.test(oldBody || '') ? (oldBody || '').replace(DATA_RE, () => block) : `${oldBody || ''}\n\n${block}`;
}

async function readIssue(num) {
  const res = await gh(`/${num}`);
  if (res.status === 404) return { missing: true };
  if (!res.ok) return { error: `GitHub API 错误: ${res.status}` };
  return { issue: await res.json() };
}

// ─── 路由 ───
export default {
  async fetch(request, env) {
    GH_TOKEN = env.GITHUB_TOKEN || '';
    const expectedSiteKey = env.SITE_KEY || SITE_KEY_DEFAULT;

    if (request.method === 'OPTIONS') return preflight();
    if (!GH_TOKEN) return json(500, { error: '服务配置错误，请联系站长' });
    if (request.headers.get('x-site-key') !== expectedSiteKey) return json(403, { error: '站点密钥错误' });
    if (!rateOk(request)) return json(429, { error: '请求过于频繁，请稍后再试' });

    const url = new URL(request.url);
    const p = url.pathname;
    let m;

    try {
      // ─── 读取物品列表 ───
      if (request.method === 'GET' && p === '/api/items') {
        const res = await gh('?state=all&labels=item&per_page=100&sort=updated&direction=desc');
        if (!res.ok) return json(res.status, { error: `GitHub API 错误: ${res.status}` });
        const issues = await res.json();
        return json(200, issues.map(toItem));
      }

      if (request.method !== 'POST') return json(405, { error: '仅支持 GET/POST' });

      // ─── 发布 ───
      if (p === '/api/items') {
        const b = await request.json();
        if (!b || !String(b.name || '').trim()) return json(400, { error: '缺少物品名称' });
        if (!String(b.ownerPhone || '').trim()) return json(400, { error: '缺少发布者手机号' });
        const data = {
          name: String(b.name).trim(),
          desc: String(b.desc || ''),
          contactType: b.contactType === 'building' ? 'building' : 'phone',
          contact: String(b.contact || ''),
          imgUrl: String(b.imgUrl || ''),
          category: String(b.category || 'other'),
          ownerPhone: String(b.ownerPhone).trim(),
          lat: Number.isFinite(b.lat) ? b.lat : null,
          lng: Number.isFinite(b.lng) ? b.lng : null,
          createTime: new Date().toISOString(),
        };
        const body = `${data.desc}\n\n<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->\n\n— 以下为自动生成的数据块，请勿删除 —`;
        const res = await gh('', 'POST', { title: `[闲置物品] ${data.name}`, body, labels: ['item'] });
        if (!res.ok) { const e = await res.json().catch(() => ({})); return json(res.status, { error: e.message || '发布失败，请稍后再试' }); }
        const created = await res.json();
        return json(200, { ok: true, id: created.number });
      }

      // ─── 借用 ───
      if ((m = p.match(/^\/api\/items\/(\d+)\/borrow$/))) {
        const { issue, missing, error } = await readIssue(+m[1]);
        if (missing) return json(404, { error: '物品不存在' });
        if (error) return json(500, { error });
        const b = await request.json().catch(() => ({}));
        const phone = String(b.operatorPhone || '').trim();
        if (!phone) return json(400, { error: '请先登录' });
        if (issue.state !== 'open') return json(409, { error: '该物品已下架' });
        const data = extractData(issue.body);
        if ((issue.labels || []).some(l => l.name === 'lent')) return json(409, { error: '该物品当前不可借用' });
        if (data.ownerPhone === phone) return json(409, { error: '不能借用自己发布的物品' });
        data.borrowedBy = phone;
        data.borrowedAt = new Date().toISOString();
        await gh(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) });
        await gh(`/${issue.number}/labels`, 'POST', { labels: ['lent'] });
        return json(200, { ok: true });
      }

      // ─── 归还 ───
      if ((m = p.match(/^\/api\/items\/(\d+)\/return$/))) {
        const { issue, missing, error } = await readIssue(+m[1]);
        if (missing) return json(404, { error: '物品不存在' });
        if (error) return json(500, { error });
        const b = await request.json().catch(() => ({}));
        const phone = String(b.operatorPhone || '').trim();
        const data = extractData(issue.body);
        if (!phone || data.borrowedBy !== phone) return json(403, { error: '只有借阅人本人可以操作归还' });
        delete data.borrowedBy;
        delete data.borrowedAt;
        await gh(`/${issue.number}`, 'PATCH', { body: withDataBlock(issue.body, data) });
        await gh(`/${issue.number}/labels/lent`, 'DELETE');
        return json(200, { ok: true });
      }

      // ─── 下架 / 上架 ───
      if ((m = p.match(/^\/api\/items\/(\d+)\/(archive|unarchive)$/))) {
        const wantClosed = m[2] === 'archive';
        const { issue, missing, error } = await readIssue(+m[1]);
        if (missing) return json(404, { error: '物品不存在' });
        if (error) return json(500, { error });
        const b = await request.json().catch(() => ({}));
        const phone = String(b.operatorPhone || '').trim();
        const data = extractData(issue.body);
        if (!phone || data.ownerPhone !== phone) return json(403, { error: '只有发布者可以管理自己的物品' });
        await gh(`/${issue.number}`, 'PATCH', { state: wantClosed ? 'closed' : 'open' });
        return json(200, { ok: true });
      }

      // ─── 删除（移除 item 标签 + 关闭，从全站彻底消失） ───
      if ((m = p.match(/^\/api\/items\/(\d+)\/delete$/))) {
        const { issue, missing, error } = await readIssue(+m[1]);
        if (missing) return json(404, { error: '物品不存在' });
        if (error) return json(500, { error });
        const b = await request.json().catch(() => ({}));
        const phone = String(b.operatorPhone || '').trim();
        const data = extractData(issue.body);
        if (!phone || data.ownerPhone !== phone) return json(403, { error: '只有发布者可以删除自己的物品' });
        await gh(`/${issue.number}/labels/item`, 'DELETE');
        await gh(`/${issue.number}`, 'PATCH', { state: 'closed' });
        return json(200, { ok: true });
      }

      return json(404, { error: '未找到接口' });
    } catch (e) {
      return json(500, { error: '服务暂时不可用，请稍后再试' });
    }
  },
};
