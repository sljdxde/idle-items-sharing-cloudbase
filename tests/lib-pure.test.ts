// ================================================
// tests/lib-pure.test.ts — 纯函数库的单元测试
// 覆盖此前没测过、但线上会直接看到结果的四个 lib：
// contact（联系方式展示）、validate（手机号/弱口令）、
// categories（分类归一与关键词推断）、safeImage（渲染前图片白名单）
// ================================================

import { describe, expect, it } from 'vitest'
import { cardPlaceText, contactRows, maskPhone } from '../src/lib/contact'
import { isValidBuilding, isValidPhone, isWeakPin, weakPinHint } from '../src/lib/validate'
import {
  CATEGORIES,
  PUBLISH_CATEGORIES,
  inferCategory,
  normalizeCategory,
} from '../src/lib/categories'
import { safeImgUrl } from '../src/lib/safeImage'
import type { Item } from '../src/lib/types'

function makeItem(partial: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: '冲击钻',
    desc: '',
    contactType: 'building',
    contact: '3 栋 2 单元 1801',
    imgUrl: '',
    status: 'available',
    lat: null,
    lng: null,
    category: 'tools',
    rentType: 'free',
    rentFee: 0,
    createTime: '2026-09-01T00:00:00.000Z',
    archived: false,
    ...partial,
  }
}

describe('contact：联系方式展示', () => {
  it('楼号门牌优先，且只出现一行', () => {
    const rows = contactRows(makeItem())
    expect(rows).toEqual([{ label: '楼号门牌', value: '3 栋 2 单元 1801' }])
  })

  it('手机号类型展示手机号', () => {
    const rows = contactRows(makeItem({ contactType: 'phone', contact: '13812345678' }))
    expect(rows).toEqual([{ label: '手机号', value: '13812345678' }])
  })

  it('空白联系方式不产生行（避免详情页出现空行）', () => {
    expect(contactRows(makeItem({ contact: '   ' }))).toEqual([])
    expect(contactRows(makeItem({ contactType: 'phone', contact: '' }))).toEqual([])
  })

  it('两端空白被裁掉', () => {
    expect(contactRows(makeItem({ contact: '  1 栋 101  ' }))[0].value).toBe('1 栋 101')
  })

  it('卡片文案：楼号原样、手机号脱敏、空值给通用提示', () => {
    expect(cardPlaceText(makeItem())).toBe('3 栋 2 单元 1801')
    expect(cardPlaceText(makeItem({ contactType: 'phone', contact: '13812345678' }))).toBe('138****5678')
    expect(cardPlaceText(makeItem({ contact: '  ' }))).toBe('联系方式见详情')
  })

  it('maskPhone 只对合法手机号脱敏，其它原样返回', () => {
    expect(maskPhone('13812345678')).toBe('138****5678')
    // 楼号、座机、太短的一律不硬套
    expect(maskPhone('3 栋 1801')).toBe('3 栋 1801')
    expect(maskPhone('1381234567')).toBe('1381234567')
    expect(maskPhone('23812345678')).toBe('23812345678')
  })
})

describe('validate：手机号与弱口令（与代理同一口径）', () => {
  it('合法大陆手机号', () => {
    for (const p of ['13812345678', '19900001111', '15012345678']) {
      expect(isValidPhone(p), p).toBe(true)
    }
  })

  it('非法手机号：长度/号段/非数字/空', () => {
    for (const p of ['', '1381234567', '138123456789', '12812345678', '11012345678', '1381234567a', '  ']) {
      expect(isValidPhone(p), p).toBe(false)
    }
  })

  it('前后空白被容忍', () => {
    expect(isValidPhone('  13812345678  ')).toBe(true)
  })

  it('楼号门牌非空即有效', () => {
    expect(isValidBuilding('1 栋')).toBe(true)
    expect(isValidBuilding('   ')).toBe(false)
  })

  it('弱口令：黑名单 / 全同 / 连续递增递减', () => {
    for (const pin of ['123456', '654321', '111111', '000000', '112233', '012345', '987654']) {
      expect(isWeakPin(pin), pin).toBe(true)
    }
    // 循环递增 789012 也算连续
    expect(isWeakPin('789012')).toBe(true)
  })

  it('强口令放行', () => {
    for (const pin of ['482913', '739205', '615842', '192837']) {
      expect(isWeakPin(pin), pin).toBe(false)
    }
  })

  it('格式不合法一律当弱（宁可拦错也不放行）', () => {
    for (const pin of ['12345', '1234567', 'abcdef', '12 34 56', '']) {
      expect(isWeakPin(pin), pin).toBe(true)
    }
  })

  it('提示文案：全同与普通弱口令分开说', () => {
    expect(weakPinHint('111111')).toContain('6 个相同数字')
    expect(weakPinHint('123456')).toContain('过于简单')
    expect(weakPinHint('482913')).toBe('')
  })
})

describe('categories：归一与关键词推断', () => {
  it('未知/空值归一为 other', () => {
    expect(normalizeCategory('')).toBe('other')
    expect(normalizeCategory(null)).toBe('other')
    expect(normalizeCategory('all')).toBe('other')
    expect(normalizeCategory('不存在')).toBe('other')
  })

  it('合法分类原样返回', () => {
    expect(normalizeCategory('electronics')).toBe('electronics')
    expect(normalizeCategory('kids')).toBe('kids')
  })

  it('发布分类不含「全部」', () => {
    expect(PUBLISH_CATEGORIES.some((c) => c.id === 'all')).toBe(false)
    expect(PUBLISH_CATEGORIES.length).toBe(CATEGORIES.length - 1)
  })

  it('按关键词推断分类', () => {
    expect(inferCategory('戴森吸尘器', '九成新')).toBe('electronics')
    expect(inferCategory('博世冲击钻', '')).toBe('tools')
    expect(inferCategory('露营帐篷', '')).toBe('outdoor')
    expect(inferCategory('儿童滑板车', '')).toBe('kids')
    expect(inferCategory('宜家书桌', '带台灯')).toBe('home')
  })

  it('「书」不该把家具抢成图书（顺序回归）', () => {
    expect(inferCategory('实木书桌', '')).toBe('home')
    expect(inferCategory('书架五层', '')).toBe('home')
    // 真·图书仍然归 books
    expect(inferCategory('儿童绘本', '')).toBe('kids')
    expect(inferCategory('三国演义小说', '')).toBe('books')
  })

  it('识别不了就给 other（不猜）', () => {
    expect(inferCategory('一件神秘的东西', '说不清楚')).toBe('other')
  })
})

describe('safeImage：渲染前图片白名单', () => {
  it('放行本站上传路径与 jpeg/png/webp 的 data URI', () => {
    expect(safeImgUrl('/uploads/a.jpg')).toBe('/uploads/a.jpg')
    for (const mime of ['jpeg', 'jpg', 'png', 'webp']) {
      const url = `data:image/${mime};base64,AAAA`
      expect(safeImgUrl(url), mime).toBe(url)
    }
  })

  it('挡掉危险/不支持的地址：javascript:、远程、svg、html', () => {
    for (const bad of [
      'javascript:alert(1)',
      'https://evil.example.com/a.jpg',
      'data:image/svg+xml;base64,AAAA',
      'data:text/html;base64,AAAA',
      '/uploads/a.svg',
      '/uploads/../etc/passwd',
    ]) {
      expect(safeImgUrl(bad), bad).toBe('')
    }
  })

  it('空值返回空串（调用方走占位图）', () => {
    expect(safeImgUrl('')).toBe('')
    expect(safeImgUrl(undefined)).toBe('')
    expect(safeImgUrl(null)).toBe('')
  })

  it('超长 data URI 被拒（与代理 IMG_DATA_MAX + 64 对齐）', () => {
    const body = 'A'.repeat(56000)
    const ok = `data:image/jpeg;base64,${body}`
    expect(ok.length).toBeLessThanOrEqual(56064)
    expect(safeImgUrl(ok)).toBe(ok)

    const tooLong = `data:image/jpeg;base64,${'A'.repeat(56100)}`
    expect(tooLong.length).toBeGreaterThan(56064)
    expect(safeImgUrl(tooLong)).toBe('')
  })
})
