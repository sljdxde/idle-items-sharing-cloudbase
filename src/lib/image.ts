// ================================================
// src/lib/image.ts — 图片压缩（上传 → data URI）
// localStorage 容量有限（~5MB），上传前用 canvas 压缩控制体积
// ================================================

/**
 * 图片文件 → 压缩后的 JPEG data URI（最长边 maxSide、质量 quality）。
 * 任何失败（非图片/解码失败/无 canvas）都会 reject，由调用方提示用户。
 */
export function compressImage(
  file: File,
  maxSide = 900,
  quality = 0.72,
): Promise<string> {
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
