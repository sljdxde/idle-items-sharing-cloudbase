// ================================================
// cloudflare-worker/rateLimit.js — 内存滑动窗口限流（Worker / Pages / 自建 Node 共用）
//
// 抽出来的原因：两个通道原本各写一份 `hits = new Map()`，都只增不减——
// 过期条目只在「同一 key 再次命中」时才被过滤，key 本身永不删除。
// 长期运行的 Worker isolate / Node 进程会持续吃内存。
//
// 这里把「清理」做成定期的：每隔 sweepIntervalMs 扫一遍，丢掉整个窗口都过期的 key；
// 另外提供 size()，让测试能断言真的回收了。
// ================================================

/**
 * @param {{ sweepIntervalMs?: number }} [options]
 * @returns {{ ok: (key: string, limit: number, windowMs: number) => boolean, size: () => number, sweep: (now?: number) => void }}
 */
export function createRateLimiter(options = {}) {
  const sweepIntervalMs = options.sweepIntervalMs ?? 60_000
  /** key（`ip|limit|windowMs`）→ 命中时间戳数组（升序） */
  const hits = new Map()
  let lastSweep = 0

  /** 窗口长度编码在 key 里，清理时反解出来 */
  function windowOf(key) {
    const parts = key.split('|')
    const w = Number(parts[parts.length - 1])
    return Number.isFinite(w) && w > 0 ? w : 60_000
  }

  function sweep(now = Date.now()) {
    for (const [key, arr] of hits) {
      // arr 升序：最后一个时间戳都过期，说明整条 key 已经没用
      const newest = arr[arr.length - 1]
      if (!newest || now - newest >= windowOf(key)) hits.delete(key)
    }
    lastSweep = now
  }

  function ok(key, limit, windowMs) {
    const now = Date.now()
    if (now - lastSweep >= sweepIntervalMs) sweep(now)

    const bucketKey = `${key}|${limit}|${windowMs}`
    const arr = (hits.get(bucketKey) || []).filter((t) => now - t < windowMs)

    if (arr.length >= limit) {
      hits.set(bucketKey, arr)
      return false
    }
    arr.push(now)
    hits.set(bucketKey, arr)
    return true
  }

  return { ok, size: () => hits.size, sweep }
}
