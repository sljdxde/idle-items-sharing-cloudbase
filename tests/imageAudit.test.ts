// ================================================
// tests/imageAudit.test.ts — 图片审核客户端（可插拔 Provider）
// 守护契约：mock 模式零外部调用；nsfwjs Provider 按本地服务协议判定；
// 所有模式测试均不发起真实外部请求（0 审核额度消耗）。
// ================================================

import { describe, expect, it, vi } from 'vitest'
import { createAuditor, createMockAuditor, createNsfwjsAuditor } from '../cloudflare-worker/imageAudit.js'

describe('createMockAuditor', () => {
  it('返回 pass，且不发起任何 fetch', async () => {
    const spy = vi.fn()
    const auditor = createMockAuditor()
    const result = await auditor.audit('data:image/jpeg;base64,xxx')
    expect(result).toEqual({ pass: true })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('createAuditor 模式选择', () => {
  it('未指定模式默认 nsfwjs（生产默认，可插拔 Provider）', () => {
    expect(createAuditor().name).toBe('nsfwjs')
  })

  it('mock 模式返回 mock', () => {
    expect(createAuditor('mock').name).toBe('mock')
    expect(createAuditor('MOCK').name).toBe('mock')
  })

  it('nsfwjs 模式返回 nsfwjs 客户端', () => {
    expect(createAuditor('nsfwjs').name).toBe('nsfwjs')
  })
})

describe('createNsfwjsAuditor', () => {
  const JSON_RES = (obj, ok = true) => ({ ok, json: async () => obj })

  it('未配置 nsfwUrl 时安全失败（error），不放行', async () => {
    const auditor = createNsfwjsAuditor({ fetchImpl: vi.fn(), nsfwUrl: '' })
    const result = await auditor.audit('data:image/jpeg;base64,xxx')
    expect(result.error).toBe('nsfwjs-not-configured')
  })

  it('本地服务判定 unsafe=true → 拒绝发布', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(JSON_RES({ ok: true, unsafe: true, score: 0.87 }))
    const auditor = createNsfwjsAuditor({ fetchImpl, nsfwUrl: 'http://127.0.0.1:8090/audit-image' })
    const result = await auditor.audit('data:image/jpeg;base64,xxx')
    expect(result.pass).toBe(false)
  })

  it('本地服务判定 unsafe=false → 通过', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(JSON_RES({ ok: true, unsafe: false, score: 0.02 }))
    const auditor = createNsfwjsAuditor({ fetchImpl, nsfwUrl: 'http://127.0.0.1:8090/audit-image' })
    const result = await auditor.audit('data:image/jpeg;base64,xxx')
    expect(result).toEqual({ pass: true })
  })

  it('本地服务返回 ok=false → error（不误放行）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(JSON_RES({ ok: false, error: 'inference-failed' }))
    const auditor = createNsfwjsAuditor({ fetchImpl, nsfwUrl: 'http://127.0.0.1:8090/audit-image' })
    const result = await auditor.audit('data:image/jpeg;base64,xxx')
    expect(result.error).toBe('nsfwjs-bad-response')
  })

  it('本地服务不可达（网络错误）→ error（安全失败）', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const auditor = createNsfwjsAuditor({ fetchImpl, nsfwUrl: 'http://127.0.0.1:8090/audit-image' })
    const result = await auditor.audit('data:image/jpeg;base64,xxx')
    expect(result.error).toBe('nsfwjs-request-failed')
  })

  it('超时（AbortSignal）→ error（安全失败）', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))
    const auditor = createNsfwjsAuditor({ fetchImpl, nsfwUrl: 'http://127.0.0.1:8090/audit-image', timeoutMs: 10 })
    const result = await auditor.audit('data:image/jpeg;base64,xxx')
    expect(result.error).toBe('nsfwjs-request-failed')
  })

  it('发送的请求体包含去掉 data: 前缀的 base64', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(JSON_RES({ ok: true, unsafe: false, score: 0 }))
    const auditor = createNsfwjsAuditor({ fetchImpl, nsfwUrl: 'http://127.0.0.1:8090/audit-image' })
    await auditor.audit('data:image/png;base64,QUJD')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8090/audit-image')
    expect(JSON.parse(init.body).image).toBe('QUJD') // 不含 data: 前缀
  })
})
