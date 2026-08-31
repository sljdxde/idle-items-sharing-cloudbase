// ================================================
// src/lib/image.ts — 图片压缩（上传 → data URI）
// 上传前把大图压进传输预算，尽量减少体积
// ================================================

export interface FitOptions {
  /** 起始最长边（默认 720） */
  maxSide?: number
  /** 起始质量（默认 0.66） */
  quality?: number
}

/**
 * 压缩图片到不超过 maxBytes（按 base64 长度估算），返回 data URI。
 * - 原图已达标且是浏览器友好的格式：原样返回，不重编码（不损画质）
 * - 超预算：交替降质量 / 缩尺寸，7 步内压进预算；压不进返回空串（调用方提示换图）
 */
export async function compressToFit(
  file: File,
  maxBytes: number,
  opts: FitOptions = {},
): Promise<string> {
  if (file.size <= maxBytes && /^image\/(jpeg|png|webp)$/.test(file.type)) {
    return readAsDataURL(file)
  }
  let side = opts.maxSide ?? 720
  let quality = opts.quality ?? 0.66
  for (let i = 0; i < 7; i++) {
    const uri = await encode(file, side, quality)
    if (approxBytes(uri) <= maxBytes) return uri
    if (i % 2 === 0) quality = Math.max(0.35, quality - 0.1)
    else side = Math.max(240, Math.round(side * 0.75))
  }
  return ''
}

/** data URI 的近似字节数：base64 主体长度 × 3/4 */
function approxBytes(dataUri: string): number {
  const comma = dataUri.indexOf(',')
  return Math.ceil((dataUri.length - comma - 1) * 0.75)
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read-fail'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function encode(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('not-image'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read-fail'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode-fail'))
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
          const w = Math.max(1, Math.round(img.naturalWidth * scale))
          const h = Math.max(1, Math.round(img.naturalHeight * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('no-canvas'))
            return
          }
          ctx.drawImage(img, 0, 0, w, h)
          // 透明 PNG 转 JPEG 会变黑底：先垫白底
          ctx.globalCompositeOperation = 'destination-over'
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          reject(new Error('compress-fail'))
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
