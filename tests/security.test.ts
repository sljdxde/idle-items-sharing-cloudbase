// ================================================
// tests/security.test.ts — 代理共用安全原语
// ================================================

import { describe, expect, it } from 'vitest'
import { safeImgUrl } from '@/lib/safeImage'
import {
  clampLatLng,
  isAllowedOrigin,
  requirePhone,
  sanitizeText,
  toPublicItem,
} from '../cloudflare-worker/security.js'

describe('safeImgUrl', () => {
  it('允许本站上传路径与 jpeg/png/webp data URI', () => {
    expect(safeImgUrl('/uploads/a1b2.jpg')).toBe('/uploads/a1b2.jpg')
    expect(safeImgUrl('data:image/jpeg;base64,abc+/=')).toBe('data:image/jpeg;base64,abc+/=')
  })
  it('拒绝 javascript / 远程 / svg', () => {
    expect(safeImgUrl('javascript:alert(1)')).toBe('')
    expect(safeImgUrl('https://evil.example/x.png')).toBe('')
    expect(safeImgUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe('')
    expect(safeImgUrl('/uploads/../secret.jpg')).toBe('')
  })
})

describe('toPublicItem / clampLatLng', () => {
  it('公开面保留登录匹配用手机号，去掉口令哈希与非法图片', () => {
    const pub = toPublicItem({
      id: 1,
      name: '电钻',
      desc: '九成新',
      contactType: 'phone',
      contact: '13800000001',
      imgUrl: 'javascript:alert(1)',
      status: 'lent',
      ownerPhone: '13800000001',
      borrowedBy: '13900000002',
      pinHmac: 'def',
      receiptHmac: 'ghi',
      lat: 30.27451,
      lng: 120.14019,
      category: 'tools',
      createTime: '2026-08-20T00:00:00.000Z',
      archived: false,
    })
    expect(pub.ownerPhone).toBe('13800000001')
    expect(pub.borrowedBy).toBe('13900000002')
    expect(pub.pinHmac).toBeUndefined()
    expect(pub.imgUrl).toBe('')
    expect(pub.lat).toBe(30.275)
    expect(pub.lng).toBe(120.14)
  })
  it('非法坐标丢弃', () => {
    expect(clampLatLng(999, 0)).toEqual({ lat: null, lng: null })
    expect(clampLatLng(30.2744, 120.1555)).toEqual({ lat: 30.274, lng: 120.156 })
  })
})

describe('requirePhone / origin', () => {
  it('只接受大陆 11 位手机号', () => {
    expect(requirePhone('13800000001')).toBe('13800000001')
    expect(requirePhone(' 13800000001 ')).toBe('13800000001')
    expect(requirePhone('12000000000')).toBe('')
    expect(requirePhone('')).toBe('')
  })
  it('Origin 白名单', () => {
    expect(isAllowedOrigin('https://sljdxde.github.io')).toBe(true)
    expect(isAllowedOrigin('https://evil.com')).toBe(false)
    expect(isAllowedOrigin('http://sljdxde.github.io')).toBe(false)
    expect(isAllowedOrigin('https://localhost')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedOrigin('http://evil.com')).toBe(false)
  })
})

describe('sanitizeText', () => {
  it('截断并去掉控制字符', () => {
    expect(sanitizeText('  ab\u0000cd  ', 10)).toBe('abcd')
    expect(sanitizeText('一二三四五六', 3)).toBe('一二三')
  })
})
