// ================================================
// tests/quota.test.ts — 图片审核额度台账（GitHub issue 存储）
// 守护契约：读-扣-耗尽-跨年重置正确；并发扣减不超扣；读带缓存；
// 全程使用内存 mock gh/ghWrite，零外部调用、零额度消耗。
// ================================================

import { describe, expect, it } from 'vitest'
import { createQuotaManager, extractLedgerData, ledgerBody } from '../cloudflare-worker/quota.js'

const LEDGER_LABEL = 'quota-ledger'

/** 内存版 GitHub issues（模拟 gh / ghWrite 的 { ok, json } 契约） */
function mockGitHub(initial = []) {
  const issues = initial.map((i) => ({ ...i }))
  const gh = async (path) => {
    if (path.startsWith('?state=all&labels=')) {
      const label = decodeURIComponent(path.split('labels=')[1].split('&')[0])
      const list = issues.filter((i) => (i.labels || []).includes(label))
      return { ok: true, json: async () => list }
    }
    const num = Number(path.replace(/^\//, ''))
    const it = issues.find((i) => i.number === num)
    return { ok: !!it, json: async () => it || {} }
  }
  const ghWrite = async (path, method, body) => {
    if (path === '' && method === 'POST') {
      const next = {
        number: issues.length ? Math.max(...issues.map((i) => i.number)) + 1 : 101,
        labels: body.labels || [],
        body: body.body,
        title: body.title,
      }
      issues.push(next)
      return { ok: true, json: async () => ({ number: next.number }) }
    }
    const num = Number(path.replace(/^\//, ''))
    const it = issues.find((i) => i.number === num)
    if (!it) return { ok: false, json: async () => {} }
    if (body.body !== undefined) it.body = body.body
    if (body.labels !== undefined) it.labels = body.labels
    return { ok: true, json: async () => ({}) }
  }
  return { gh, ghWrite, issues: () => issues }
}

describe('extractLedgerData / ledgerBody 序列化', () => {
  it('写入后可读回同一结构', () => {
    const data = { provider: 'baidu', year: 2026, used: 3, limit: 10000 }
    expect(extractLedgerData(ledgerBody(data))).toEqual(data)
  })
  it('空/畸形 body 返回 null', () => {
    expect(extractLedgerData('')).toBeNull()
    expect(extractLedgerData('<!--DATA_START not json DATA_END-->')).toBeNull()
  })
})

describe('createQuotaManager', () => {
  it('无台账时初始 remaining=limit，扣减后 used 增加', async () => {
    const m = mockGitHub()
    const q = createQuotaManager({ gh: m.gh, ghWrite: m.ghWrite, now: () => Date.UTC(2026, 0, 1), limit: 100 })
    const c0 = await q.check()
    expect(c0).toMatchObject({ remaining: 100, used: 0, year: 2026 })
    const r = await q.consume(1)
    expect(r).toMatchObject({ ok: true, remaining: 99 })
    const c1 = await q.check()
    expect(c1).toMatchObject({ remaining: 99, used: 1 })
  })

  it('累计扣减不超过 limit，且耗尽后 remaining=0', async () => {
    const m = mockGitHub()
    const q = createQuotaManager({ gh: m.gh, ghWrite: m.ghWrite, now: () => Date.UTC(2026, 0, 1), limit: 3 })
    await q.consume(1)
    await q.consume(1)
    const r3 = await q.consume(1)
    expect(r3).toMatchObject({ ok: true, remaining: 0 })
    const r4 = await q.consume(1)
    expect(r4).toMatchObject({ ok: true, remaining: 0 }) // 封顶，不出现负数
    expect((await q.check()).remaining).toBe(0)
  })

  it('并发扣减不超扣（串行锁）', async () => {
    const m = mockGitHub()
    const q = createQuotaManager({ gh: m.gh, ghWrite: m.ghWrite, now: () => Date.UTC(2026, 0, 1), limit: 100 })
    await Promise.all([q.consume(1), q.consume(1), q.consume(1), q.consume(1), q.consume(1)])
    const c = await q.check()
    expect(c.used).toBe(5)
    expect(c.remaining).toBe(95)
  })

  it('跨年自动重置 used=0', async () => {
    const m = mockGitHub()
    let nowVal = Date.UTC(2026, 6, 1)
    const q = createQuotaManager({ gh: m.gh, ghWrite: m.ghWrite, now: () => nowVal, limit: 100 })
    await q.consume(10)
    expect((await q.check()).used).toBe(10)
    nowVal = Date.UTC(2027, 0, 1) // 跨年
    const c = await q.check()
    expect(c.year).toBe(2027)
    expect(c.used).toBe(0)
    expect(c.remaining).toBe(100)
  })

  it('读缓存：10s 内 check 不重复打 GitHub', async () => {
    const m = mockGitHub()
    let ghCalls = 0
    const gh = async (path) => {
      ghCalls += 1
      return m.gh(path)
    }
    let nowVal = 0
    const q = createQuotaManager({ gh, ghWrite: m.ghWrite, now: () => nowVal, limit: 100 })
    await q.check()
    await q.check()
    await q.check()
    expect(ghCalls).toBe(1) // 缓存命中
    nowVal = 11_000 // 超过 ttl
    await q.check()
    expect(ghCalls).toBe(2)
  })

  it('已存在台账 issue 时继续使用并在原 issue 上扣减', async () => {
    const existing = ledgerBody({ provider: 'baidu', year: 2026, used: 40, limit: 100 })
    const m = mockGitHub([{ number: 7, labels: [LEDGER_LABEL], body: existing }])
    const q = createQuotaManager({ gh: m.gh, ghWrite: m.ghWrite, now: () => Date.UTC(2026, 0, 1), limit: 100 })
    expect((await q.check()).remaining).toBe(60)
    await q.consume(1)
    expect((await q.check()).remaining).toBe(59)
    expect(m.issues().length).toBe(1) // 未新建
    expect(m.issues()[0].number).toBe(7)
  })
})
