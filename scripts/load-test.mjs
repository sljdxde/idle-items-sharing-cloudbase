// ================================================
// scripts/load-test.mjs — 代理链路压测（真实 GitHub 数据层）
// 用例：50 用户并发创建物品 + 40 用户并发借用（创建/借用人群重叠）+ 读风暴
// 用法：
//   node scripts/load-test.mjs                # 跑压测（创建+借用+读风暴），ID 存 /tmp/loadtest-ids.json
//   node scripts/load-test.mjs --cleanup      # 归档（下架）全部压测物品并取消排队 CI
// 指标：成功率、错误分类、延迟 p50/p95/max
// ================================================

import { writeFileSync, readFileSync, existsSync } from 'node:fs'

const BASE = process.env.LOADTEST_BASE || 'http://47.85.133.20'
const SITE_KEY = 'neighborhood-share-2026'
const N_CREATE = 50
const N_BORROW = 40
const CONCURRENCY = 10
const IDS_FILE = '/tmp/loadtest-ids.json'

// 60 个合法手机号：0-49 创建，20-59 借用（30 人重叠）
const phones = Array.from({ length: 60 }, (_, i) => `138${String(10000000 + i * 137).slice(0, 8)}`)

const stats = { create: [], borrow: [], read: [] }

function record(bucket, started, result) {
  bucket.push({ ms: Date.now() - started, ...result })
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-site-key': SITE_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `http ${res.status}`), { status: res.status })
  return data
}

/** 并发池：tasks 为 () => Promise，limit 并发 */
async function pool(tasks, limit) {
  const out = []
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const t = tasks[idx++]
      out.push(await t())
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return out
}

function pct(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

function report(name, bucket) {
  const ok = bucket.filter((r) => r.ok).length
  const errs = {}
  for (const r of bucket) if (!r.ok) errs[r.error] = (errs[r.error] || 0) + 1
  const ms = bucket.map((r) => r.ms)
  console.log(
    `\n[${name}] 总数=${bucket.length} 成功=${ok} 失败=${bucket.length - ok} ` +
      `p50=${pct(ms, 50)}ms p95=${pct(ms, 95)}ms max=${pct(ms, 100)}ms`,
  )
  for (const [e, n] of Object.entries(errs)) console.log(`    错误×${n}: ${e}`)
  return ok === bucket.length
}

async function phaseCreate() {
  console.log(`\n=== 阶段A：${N_CREATE} 用户并发创建物品（并发 ${CONCURRENCY}）===`)
  const tasks = Array.from({ length: N_CREATE }, (_, i) => async () => {
    const started = Date.now()
    try {
      const r = await api('/items', {
        method: 'POST',
        body: {
          name: `压测-${String(i).padStart(2, '0')}`,
          desc: '性能测试自动创建，稍后清理',
          contactType: 'building',
          contact: `${i}-001`,
          category: 'other',
          ownerPhone: phones[i],
          lat: null,
          lng: null,
        },
      })
      record(stats.create, started, { ok: true, id: r.id })
      return { id: r.id, owner: phones[i] }
    } catch (e) {
      record(stats.create, started, { ok: false, error: e.message })
      return null
    }
  })
  const created = (await pool(tasks, CONCURRENCY)).filter(Boolean)
  writeFileSync(IDS_FILE, JSON.stringify(created))
  console.log(`创建成功 ${created.length}/${N_CREATE}，ID 已存 ${IDS_FILE}`)
  return created
}

async function phaseBorrow(created) {
  console.log(`\n=== 阶段B：${N_BORROW} 用户并发借用（借用者∈phones[20..59]，与创建者重叠 30 人）===`)
  const ids = created.map((c) => c.id)
  // GitHub 高频写后列表有秒级延迟，重试直到目标足够
  let testItems = []
  for (let attempt = 0; attempt < 4 && testItems.length < N_BORROW; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000))
    const items = await api('/items')
    testItems = items.filter((it) => ids.includes(it.id) && it.status === 'available')
  }
  console.log(`可见可借目标 ${testItems.length} 件`)
  const ownerOf = new Map(created.map((c) => [c.id, c.owner]))
  const tasks = Array.from({ length: N_BORROW }, (_, k) => async () => {
    const borrower = phones[20 + k] // 20-59
    const target = testItems.find((it) => ownerOf.get(it.id) !== borrower && it.status === 'available')
    if (!target) return record(stats.borrow, Date.now(), { ok: false, error: '无可用目标' })
    target.status = 'lent' // 本地标记避免重复借同一件
    const started = Date.now()
    try {
      await api(`/items/${target.id}/borrow`, { method: 'POST', body: { operatorPhone: borrower } })
      record(stats.borrow, started, { ok: true })
    } catch (e) {
      record(stats.borrow, started, { ok: false, error: e.message })
    }
  })
  await pool(tasks, CONCURRENCY)
}

async function phaseReadStorm() {
  console.log(`\n=== 阶段C：50 并发读风暴（GET /api/items）===`)
  const tasks = Array.from({ length: 50 }, () => async () => {
    const started = Date.now()
    try {
      const list = await api('/items')
      record(stats.read, started, { ok: true, n: list.length })
    } catch (e) {
      record(stats.read, started, { ok: false, error: e.message })
    }
  })
  await pool(tasks, 50)
}

async function cleanup() {
  console.log('=== 清理：归档压测物品 ===')
  const created = existsSync(IDS_FILE) ? JSON.parse(readFileSync(IDS_FILE, 'utf8')) : []
  const ids = created.map((c) => (typeof c === 'number' ? c : c.id))
  const ownerOf = new Map(created.map((c) => [typeof c === 'number' ? c : c.id, c.owner]))
  const items = await api('/items')
  const targets = items.filter((it) => ids.includes(it.id))
  let done = 0
  for (const it of targets) {
    const phone = ownerOf.get(it.id) || it.ownerPhone
    if (!phone) {
      console.log(`  归档 ${it.id} 失败: 没有发布者手机号`)
      continue
    }
    try {
      await api(`/items/${it.id}/archive`, { method: 'POST', body: { operatorPhone: phone } })
      done++
    } catch (e) {
      console.log(`  归档 ${it.id} 失败: ${e.message}`)
    }
    await new Promise((r) => setTimeout(r, 700)) // 串行+间隔，避开二级限流
  }
  console.log(`已归档 ${done}/${targets.length}`)
}

const mode = process.argv[2]
if (mode === '--cleanup') {
  await cleanup()
} else if (mode === '--read') {
  await phaseReadStorm()
  report('读取', stats.read)
} else if (mode === '--borrow') {
  const ids = JSON.parse(readFileSync(IDS_FILE, 'utf8'))
  await phaseBorrow(ids)
  await phaseReadStorm()
  report('借用', stats.borrow)
  report('读取', stats.read)
} else {
  const t0 = Date.now()
  const ids = await phaseCreate()
  await phaseBorrow(ids)
  await phaseReadStorm()
  const a = report('创建', stats.create)
  const b = report('借用', stats.borrow)
  const c = report('读取', stats.read)
  console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s；创建${a ? '✓' : '✗'} 借用${b ? '✓' : '✗'} 读${c ? '✓' : '✗'}`)
  console.log('→ 完成后请运行 node scripts/load-test.mjs --cleanup 清理压测数据')
}
