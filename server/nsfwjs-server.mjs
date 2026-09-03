// ================================================
// server/nsfwjs-server.mjs — 本地 NSFWJS 图片审核服务（自托管、免费、无限）
//
// 与 cloudflare-worker/imageAudit.js 的 NSFWJS Provider 配套：
//   POST /audit-image  { image: "<base64>" }  →  { ok: true, unsafe, score } | { ok: false, error }
//   GET  /health                              →  { ok: true, model: 'loaded' }
//
// 依赖（本目录独立 package.json，不进前端/worker 构建）：
//   @tensorflow/tfjs-node   nsfwjs
// 模型：默认从 nsfwjs 托管地址自动下载；也可 NSFW_MODEL 指定本地目录（file://）
//
// 判定：Porn + Hentai + Sexy 概率和 > 阈值（默认 0.4）→ unsafe
//
// 运行：cd server && npm install && node nsfwjs-server.mjs
//       监听 127.0.0.1:8090，用 nginx 按需反代；或在同一台机内网直调。
// ================================================

import { createServer } from 'node:http'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tf from '@tensorflow/tfjs-node'
import * as nsfwjs from 'nsfwjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const HOST = process.env.NSFW_HOST || '127.0.0.1'
const PORT = Number(process.env.NSFW_PORT || 8090)
const MODEL_PATH = process.env.NSFW_MODEL || '' // 空 = 用 nsfwjs 默认托管模型
const UNSAFE_THRESHOLD = Number(process.env.NSFW_THRESHOLD || 0.4)
const MAX_BODY = 1024 * 1024 // 1MB，覆盖 base64 上限

let model = null
let modelLoading = null

async function loadModel() {
  if (MODEL_PATH) {
    // file:// 路径，加载本地 graph 模型（性能更好）
    const p = MODEL_PATH.startsWith('file://') ? MODEL_PATH : `file://${join(ROOT, MODEL_PATH)}`
    model = await nsfwjs.load(p, { type: 'graph' })
  } else {
    model = await nsfwjs.load() // 默认托管模型
  }
  return model
}

function getModel() {
  if (model) return Promise.resolve(model)
  if (!modelLoading) modelLoading = loadModel()
  return modelLoading
}

function classifyUnsafe(predictions) {
  const p = { Neutral: 0, Drawing: 0, Hentai: 0, Porn: 0, Sexy: 0 }
  for (const x of predictions) p[x.className] = x.probability || 0
  const score = p.Porn + p.Hentai + p.Sexy
  return { unsafe: score > UNSAFE_THRESHOLD, score: Number(score.toFixed(4)) }
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('too-large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('bad-json'))
      }
    })
    req.on('error', reject)
  })
}

createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0]

  if (req.method === 'GET' && url === '/health') {
    try {
      await getModel()
      return json(res, 200, { ok: true, model: 'loaded', threshold: UNSAFE_THRESHOLD })
    } catch (e) {
      return json(res, 503, { ok: false, error: 'model-not-loaded', message: String(e.message || e) })
    }
  }

  if (req.method === 'POST' && url === '/audit-image') {
    let body
    try {
      body = await readBody(req)
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message === 'too-large' ? 'too-large' : 'bad-json' })
    }
    const image = typeof body.image === 'string' ? body.image.trim() : ''
    if (!image) return json(res, 400, { ok: false, error: 'missing-image' })

    let tensor = null
    try {
      const m = await getModel()
      // base64 → Buffer → Tensor
      const buffer = Buffer.from(image, 'base64')
      if (buffer.length === 0) return json(res, 400, { ok: false, error: 'invalid-base64' })
      tensor = tf.node.decodeImage(buffer, 3)
      const predictions = await m.classify(tensor)
      const { unsafe, score } = classifyUnsafe(predictions)
      return json(res, 200, { ok: true, unsafe, score, detail: predictions })
    } catch (e) {
      return json(res, 500, { ok: false, error: 'inference-failed', message: String(e.message || e) })
    } finally {
      if (tensor) tensor.dispose()
    }
  }

  json(res, 404, { ok: false, error: 'not-found' })
}).listen(PORT, HOST, () => {
  console.log(`[nsfwjs-server] listening on http://${HOST}:${PORT}`)
  console.log(`[nsfwjs-server] threshold=${UNSAFE_THRESHOLD} model=${MODEL_PATH || '(default hosted)'}`)
})
