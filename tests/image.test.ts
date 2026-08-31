// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { compressToFit } from '../src/lib/image'

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

describe('compressToFit', () => {
  it('小图直通：不超预算且为 web 友好格式时原样返回，不重编码', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252])
    const file = new File([bytes], 'a.jpg', { type: 'image/jpeg' })
    const uri = await compressToFit(file, 100 * 1024)
    expect(uri).toBe(`data:image/jpeg;base64,${bytesToB64(bytes)}`)
  })

  it('png / webp 小图同样直通', async () => {
    for (const type of ['image/png', 'image/webp']) {
      const bytes = new Uint8Array([9, 8, 7])
      const file = new File([bytes], 'x', { type })
      const uri = await compressToFit(file, 1024)
      expect(uri).toBe(`data:${type};base64,${bytesToB64(bytes)}`)
    }
  })

  it('超预算即进入压缩路径（不直通，结果与原文不同）', async () => {
    const bytes = new Uint8Array(64 * 1024).fill(7)
    const file = new File([bytes], 'big.jpg', { type: 'image/jpeg' })
    // happy-dom 无 canvas/Image 解码：编码分支会 reject（decode-fail），
    // 这里只断言它没有走直通（直通会 resolve 原文）。
    await expect(compressToFit(file, 1024)).rejects.toThrow()
  })
})
