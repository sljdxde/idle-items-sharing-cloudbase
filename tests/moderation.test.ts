// ================================================
// tests/moderation.test.ts — 发布内容安全审核
// 守护契约：黄赌毒 / 暴力违禁品内容一律拦截，正常闲置物品放行；
// 带空格/标点/全角等变体也能命中；图片必须是真实 jpeg/png/webp。
// ================================================

import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  checkImageDataUrl,
  moderateText,
  normalizeForScan,
} from '../cloudflare-worker/moderation.js'

describe('moderateText 正常内容放行', () => {
  it('允许普通闲置物品文案', () => {
    expect(moderateText('九成新折叠雨伞，小区自取')).toEqual({ pass: true })
    expect(moderateText('宜家单人沙发，可送货上门')).toEqual({ pass: true })
    expect(moderateText('儿童滑板车，刹车灵敏')).toEqual({ pass: true })
  })
  it('允许包含"牌"字面的日常用词（不误伤棋牌）', () => {
    expect(moderateText('一副扑克牌，全新未拆')).toEqual({ pass: true })
    expect(moderateText('麻将桌转让')).toEqual({ pass: true })
  })
  it('空文本放行', () => {
    expect(moderateText('')).toEqual({ pass: true })
    expect(moderateText('   ')).toEqual({ pass: true })
  })
})

describe('moderateText 色情低俗拦截', () => {
  it('命中标题/描述/联系方式', () => {
    expect(moderateText('出售原味内衣')).toEqual(
      expect.objectContaining({ pass: false, category: '色情低俗' }),
    )
    expect(moderateText('原味内衣，穿过没洗')).toEqual(
      expect.objectContaining({ pass: false, category: '色情低俗' }),
    )
    expect(moderateText('联系微信约炮')).toEqual(
      expect.objectContaining({ pass: false, category: '色情低俗' }),
    )
  })
})

describe('moderateText 赌博拦截', () => {
  it('命中赌博相关词', () => {
    expect(moderateText('六合彩特码大全')).toEqual(
      expect.objectContaining({ pass: false, category: '赌博' }),
    )
    expect(moderateText('时时彩平台代理')).toEqual(
      expect.objectContaining({ pass: false, category: '赌博' }),
    )
    expect(moderateText('百家乐真人荷官')).toEqual(
      expect.objectContaining({ pass: false, category: '赌博' }),
    )
  })
})

describe('moderateText 毒品拦截', () => {
  it('命中毒品名称', () => {
    expect(moderateText('出售冰毒原料')).toEqual(
      expect.objectContaining({ pass: false, category: '毒品' }),
    )
    expect(moderateText('大麻种子现货')).toEqual(
      expect.objectContaining({ pass: false, category: '毒品' }),
    )
    expect(moderateText('摇头丸货源')).toEqual(
      expect.objectContaining({ pass: false, category: '毒品' }),
    )
  })
})

describe('moderateText 暴力/违禁品拦截', () => {
  it('命中管制物品', () => {
    expect(moderateText('仿真枪转让')).toEqual(
      expect.objectContaining({ pass: false, category: '暴力违禁品' }),
    )
    expect(moderateText('弓弩出 售')).toEqual(
      expect.objectContaining({ pass: false, category: '暴力违禁品' }),
    )
  })
})

describe('normalizeForScan 变体对抗', () => {
  it('去掉空格/标点/全角后仍命中', () => {
    // "六 合 彩"、"赌·博"、全角"博 彩"
    expect(normalizeForScan('六 合 彩')).toBe('六合彩')
    expect(moderateText('六 合 彩，稳赚')).toEqual(
      expect.objectContaining({ pass: false, category: '赌博' }),
    )
    expect(moderateText('赌·博 群 加我')).toEqual(
      expect.objectContaining({ pass: false, category: '赌博' }),
    )
    expect(moderateText('卖冰　毒（量大优惠）')).toEqual(
      expect.objectContaining({ pass: false, category: '毒品' }),
    )
  })
  it('全角/半角标点归一', () => {
    expect(normalizeForScan('「约炮」？')).toContain('约炮')
    expect(moderateText('原味内衣，约 炮 走开')).toEqual(
      expect.objectContaining({ pass: false, category: '色情低俗' }),
    )
  })
})

describe('checkImageDataUrl 图片硬性校验', () => {
  // 最小合法 PNG：8 字节签名 + IHDR 头，魔数即可通过
  const PNG_1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  it('接受合法 png', () => {
    expect(checkImageDataUrl(PNG_1x1)).toEqual({ ok: true })
  })
  it('拒绝伪造的"图片"（内容不是图片）', () => {
    // base64("<script>alert(1)</script>") 伪装成 image/png
    const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')
    expect(checkImageDataUrl(fake)).toEqual(expect.objectContaining({ ok: false }))
  })
  it('拒绝非白名单格式', () => {
    expect(checkImageDataUrl('data:image/gif;base64,AAAA')).toEqual(
      expect.objectContaining({ ok: false }),
    )
    expect(checkImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toEqual(
      expect.objectContaining({ ok: false }),
    )
  })
  it('拒绝损坏/过短数据', () => {
    expect(checkImageDataUrl('data:image/png;base64,AAAA')).toEqual(
      expect.objectContaining({ ok: false }),
    )
    expect(checkImageDataUrl('')).toEqual(expect.objectContaining({ ok: false }))
  })
  it('base64ToBytes 与魔数解码可用', () => {
    const b = base64ToBytes(Buffer.from('RIFF1234WEBP').toString('base64'))
    expect(b[0]).toBe(0x52)
    expect(b[8]).toBe(0x57)
  })
})
