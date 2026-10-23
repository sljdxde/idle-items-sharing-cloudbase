// ================================================
// tests/rate-limit.test.ts — 共享限流器的单元测试
// 关注两件事：窗口语义是否准，以及「过期 key 会不会被回收」
// （原来两个通道各写一份 Map，只增不减 = 内存慢泄漏）
// ================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRateLimiter } from '../cloudflare-worker/rateLimit.js'

const T0 = new Date('2026-10-23T10:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('滑动窗口', () => {
  it('窗口内放行 limit 次，第 limit+1 次拒绝', () => {
    const rl = createRateLimiter()
    for (let i = 0; i < 5; i++) expect(rl.ok('1.2.3.4', 5, 60_000), `第 ${i + 1} 次`).toBe(true)
    expect(rl.ok('1.2.3.4', 5, 60_000)).toBe(false)
  })

  it('窗口滑过后恢复放行', () => {
    const rl = createRateLimiter()
    for (let i = 0; i < 3; i++) rl.ok('ip', 3, 10_000)
    expect(rl.ok('ip', 3, 10_000)).toBe(false)

    vi.setSystemTime(T0 + 10_001)
    expect(rl.ok('ip', 3, 10_000)).toBe(true)
  })

  it('不同 key、不同窗口互不影响', () => {
    const rl = createRateLimiter()
    expect(rl.ok('a', 1, 60_000)).toBe(true)
    expect(rl.ok('a', 1, 60_000)).toBe(false)
    // 换 IP
    expect(rl.ok('b', 1, 60_000)).toBe(true)
    // 换窗口长度（同一 IP 的另一档限流）
    expect(rl.ok('a', 1, 120_000)).toBe(true)
  })
})

describe('过期 key 回收', () => {
  it('sweep 之后过期 key 被删掉（size 回落）', () => {
    const rl = createRateLimiter({ sweepIntervalMs: Number.MAX_SAFE_INTEGER })
    for (let i = 0; i < 50; i++) rl.ok(`ip-${i}`, 5, 1000)
    expect(rl.size()).toBe(50)

    vi.setSystemTime(T0 + 2000)
    rl.sweep()
    // 整个窗口都过去了，一条都不该留
    expect(rl.size()).toBe(0)
  })

  it('未过期的 key 不会被 sweep 误删', () => {
    const rl = createRateLimiter({ sweepIntervalMs: Number.MAX_SAFE_INTEGER })
    rl.ok('recent', 5, 60_000)
    vi.setSystemTime(T0 + 30_000)
    rl.sweep()
    expect(rl.size()).toBe(1)
  })

  it('自动清理：到间隔后下一次 ok 会顺带回收，不会无限增长', () => {
    const rl = createRateLimiter({ sweepIntervalMs: 5000 })
    for (let i = 0; i < 20; i++) rl.ok(`old-${i}`, 5, 1000)
    expect(rl.size()).toBe(20)

    // 超过窗口 + 超过清理间隔：下一次 ok 触发 sweep
    vi.setSystemTime(T0 + 10_000)
    rl.ok('fresh-ip', 5, 1000)

    // 只剩这次新写入的 key
    expect(rl.size()).toBe(1)
  })
})
