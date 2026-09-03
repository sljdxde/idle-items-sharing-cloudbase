// ================================================
// cloudflare-worker/imageAudit.js — 图片画面审核客户端（可插拔 Provider 机制）
//
// 接口契约（所有 Provider 必须满足）：
//   create 函数返回 { name: string, audit(imageDataUrl) -> Promise<Result> }
//   Result = { pass: true }                        // 通过
//          | { pass: false, reason: string }       // 违规，拒绝发布
//          | { error: string }                     // 审核失败/未配置 → 安全失败（拒绝该次发布、不误放行）
//
// 选择 Provider：createAuditor(mode, deps)
//   'mock'   → 测试/CI 专用，不发起外部调用
//   'nsfwjs' → 调用本地自托管的 NSFWJS 审核服务（HTTP，默认）
//
// ★ 新增更好的开源库时：写一个 createXxxAuditor(deps) 实现上面的契约，
//   然后在 createAuditor 的 switch 里加一行即可，业务代码零改动。
// ================================================

/** 按模式创建审核客户端；默认 nsfwjs（生产），测试请显式传 'mock' */
export function createAuditor(mode, deps = {}) {
  const m = String(mode || 'nsfwjs').toLowerCase()
  switch (m) {
    case 'mock':
      return createMockAuditor()
    case 'nsfwjs':
      return createNsfwjsAuditor(deps)
    default:
      return createMockAuditor()
  }
}

/** Mock Provider：不放行真实外呼（自动化测试专用，0 外部调用） */
export function createMockAuditor() {
  return {
    name: 'mock',
    async audit() {
      return { pass: true }
    },
  }
}

/**
 * NSFWJS Provider：调用本地自托管审核服务的 HTTP 接口。
 * deps: { fetchImpl, nsfwUrl, timeoutMs }
 *   nsfwUrl 为本地服务地址（如 http://127.0.0.1:8090/audit-image），由环境变量 NSFWJS_URL 提供
 * 本地服务响应协议：{ ok: true, unsafe: boolean, score?: number } | { ok: false }
 */
export function createNsfwjsAuditor({
  fetchImpl = globalThis.fetch,
  nsfwUrl = '',
  timeoutMs = 5000,
} = {}) {
  return {
    name: 'nsfwjs',
    async audit(imageDataUrl) {
      if (!nsfwUrl) return { error: 'nsfwjs-not-configured' }
      const comma = String(imageDataUrl).indexOf(',')
      const image = comma >= 0 ? String(imageDataUrl).slice(comma + 1) : String(imageDataUrl)
      if (!image) return { error: 'bad-image' }
      try {
        const r = await fetchImpl(nsfwUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!r.ok) return { error: 'nsfwjs-http' }
        const j = await r.json().catch(() => null)
        if (!j || j.ok !== true) return { error: 'nsfwjs-bad-response' }
        if (j.unsafe === true) return { pass: false, reason: '图片内容违规，禁止发布' }
        return { pass: true }
      } catch (e) {
        return { error: 'nsfwjs-request-failed' }
      }
    },
  }
}
