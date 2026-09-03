// ================================================
// cloudflare-worker/quota.js — 图片审核额度台账（GitHub issue 存储）
// 台账 = 仓库内一个带 quota-ledger 标签的 issue，body 存 DATA 块 JSON：
//   { provider, year, used, limit, resetAt }
// - 10s 内存缓存 + single-flight：读台账不频繁打 GitHub
// - consume 读-改-写回 + 串行锁：并发扣减不超扣
// - 跨年自动重置 used=0
// gh / ghWrite 由 worker.js 注入，便于单测（mock fetch / 内存实现）。
// ================================================

export const QUOTA_LEDGER_LABEL = 'quota-ledger'
export const QUOTA_LEDGER_TITLE = '[系统] 图片审核额度台账'
export const QUOTA_DATA_START = '<!--DATA_START'
export const QUOTA_DATA_END = 'DATA_END-->'
export const DEFAULT_LIMIT = 10000

function currentYear(now) {
  return new Date(now).getUTCFullYear()
}

export function extractLedgerData(body) {
  if (!body) return null
  const s = body.indexOf(QUOTA_DATA_START)
  const e = body.indexOf(QUOTA_DATA_END)
  if (s < 0 || e <= s) return null
  try {
    const parsed = JSON.parse(body.slice(s + QUOTA_DATA_START.length, e).trim())
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function ledgerBody(data) {
  return `${QUOTA_DATA_START}\n${JSON.stringify(data)}\n${QUOTA_DATA_END}`
}

/**
 * 创建额度管理实例。
 * @param {object} opts
 * @param {Function} opts.gh          GitHub GET（path 形如 '/{num}' 或 '?state=all&labels=x'）
 * @param {Function} opts.ghWrite     GitHub 写（path, method, body）返回 { ok, json }
 * @param {Function} [opts.now]       时间源（默认 Date.now，可注入便于测试跨年）
 * @param {number}   [opts.ttl]       读缓存毫秒（默认 10000）
 * @param {number}   [opts.limit]     年度额度上限（默认 10000）
 */
export function createQuotaManager({ gh, ghWrite, now = () => Date.now(), ttl = 10000, limit = DEFAULT_LIMIT } = {}) {
  let cache = { at: 0, data: null }
  let readInflight = null
  let consumeQueue = Promise.resolve()

  async function findLedger() {
    const r = await gh(`?state=all&labels=${QUOTA_LEDGER_LABEL}&per_page=10`)
    if (!r.ok) return { error: true }
    const arr = await r.json()
    if (!Array.isArray(arr) || arr.length === 0) return { issue: null }
    return { issue: arr[0] }
  }

  function normalize(d) {
    const yr = currentYear(now())
    return {
      provider: d && typeof d.provider === 'string' ? d.provider : 'baidu',
      year: Number.isFinite(d?.year) ? Math.floor(d.year) : yr,
      used: Number.isFinite(d?.used) ? Math.max(0, Math.floor(d.used)) : 0,
      limit: Number.isFinite(d?.limit) && d.limit > 0 ? Math.floor(d.limit) : limit,
    }
  }

  async function writeLedger(data) {
    const { issue } = await findLedger()
    const body = ledgerBody(data)
    if (issue) {
      const r = await ghWrite(`/${issue.number}`, 'PATCH', { body })
      return r.ok
    }
    const r = await ghWrite('', 'POST', {
      title: QUOTA_LEDGER_TITLE,
      body,
      labels: [QUOTA_LEDGER_LABEL],
    })
    return r.ok
  }

  /** 读台账（带缓存 + single-flight）；跨年自动重置 */
  async function read() {
    if (cache.data && now() - cache.at < ttl) return cache.data
    if (!readInflight) {
      readInflight = (async () => {
        try {
          const { issue, error } = await findLedger()
          if (error) return { error: true }
          const data = normalize(issue ? extractLedgerData(issue.body) : null)
          const yr = currentYear(now())
          if (data.year < yr) {
            data.year = yr
            data.used = 0
          }
          cache = { at: now(), data }
          return data
        } finally {
          readInflight = null
        }
      })()
    }
    return readInflight
  }

  /** 查询额度：{ remaining, used, limit, year } | { error } */
  async function check() {
    const d = await read()
    if (d.error) return { error: true }
    return {
      remaining: Math.max(0, d.limit - d.used),
      used: d.used,
      limit: d.limit,
      year: d.year,
    }
  }

  /** 强制读最新（绕过缓存） */
  async function readFresh() {
    cache = { at: 0, data: null }
    return read()
  }

  /** 扣减额度并回写：{ ok, remaining } | { error }；串行锁防并发超扣 */
  async function consume(amount = 1) {
    const run = consumeQueue.then(() => doConsume(amount))
    consumeQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function doConsume(amount = 1) {
    const fresh = await readFresh()
    if (fresh.error) return { error: true }
    const d = normalize(fresh)
    const n = Math.max(1, Math.floor(amount))
    const used = Math.min(d.limit, d.used + n)
    const data = { ...d, used }
    const ok = await writeLedger(data)
    if (!ok) return { error: true }
    cache = { at: now(), data }
    return { ok: true, remaining: Math.max(0, data.limit - data.used) }
  }

  return {
    check,
    consume,
    invalidate: () => {
      cache = { at: 0, data: null }
    },
  }
}
