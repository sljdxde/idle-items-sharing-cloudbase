// ================================================
// tests/nsfwjs.integration.test.ts — 真实调用本地 NSFWJS 服务（集成测试）
// 前置：先启动 server/nsfwjs-server.mjs（监听 127.0.0.1:8090）
//   cd server && node nsfwjs-server.mjs
// 服务未启动时本组测试自动 skip，不阻塞无服务环境（如 CI）。
// 可用环境变量 NSFWJS_URL 指定服务地址。
// ================================================

import { describe, expect, it } from 'vitest'
import * as zlib from 'node:zlib'

const BASE = process.env.NSFWJS_URL || 'http://127.0.0.1:8090'

async function serviceUp() {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

const CRC_TABLE = (() => {
  const t = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])))
  return Buffer.concat([len, type, data, crc])
}

/** 构造一张 size×size 纯色 PNG（合法、Neutral 正常图）的 base64 */
function solidPng(size = 64, rgb = [180, 200, 220]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(size).fill(rgb).flat())])
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const png = Buffer.concat([
    sig,
    pngChunk(Buffer.from('IHDR'), ihdr),
    pngChunk(Buffer.from('IDAT'), zlib.deflateSync(raw)),
    pngChunk(Buffer.from('IEND'), Buffer.alloc(0)),
  ])
  return png.toString('base64')
}

const up = await serviceUp()
const suite = up ? describe : describe.skip

suite('NSFWJS 本地服务 · 真实推理', () => {
  it('/health 返回模型已加载', async () => {
    const r = await fetch(`${BASE}/health`)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.model).toBe('loaded')
  })

  it('正常纯色图判定 unsafe=false', async () => {
    const image = solidPng()
    const r = await fetch(`${BASE}/audit-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    })
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(j.unsafe).toBe(false)
    expect(j.score).toBeLessThan(0.4)
    expect(Array.isArray(j.detail)).toBe(true)
  })

  it('空 image 返回 400', async () => {
    const r = await fetch(`${BASE}/audit-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: '' }),
    })
    expect(r.status).toBe(400)
  })
})
