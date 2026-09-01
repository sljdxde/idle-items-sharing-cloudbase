// ================================================
// tests/github.test.ts — 共享数据层读取契约测试
// DATA 块解析 / 标签与状态映射（与 scripts/gen-items.mjs、cloudflare-worker 同构）
// ================================================

import { describe, expect, it } from 'vitest'
import { DATA_END, DATA_START, extractDataBlock, parseIssue, type IssueLike } from '@/lib/github'

function makeIssue(partial: Partial<IssueLike>): IssueLike {
  return {
    number: 7,
    title: '[闲置物品] 戴森V8吸尘器',
    body: '',
    state: 'open',
    labels: [],
    ...partial,
  }
}

const BLOCK = `${DATA_START}\n${JSON.stringify({
  name: '戴森V8吸尘器',
  desc: '九成新',
  contactType: 'building',
  contact: '3栋1801',
  imgUrl: '',
  category: 'electronics',
  ownerPhone: '13800000001',
  borrowedBy: undefined,
  lat: 30.2745,
  lng: 120.14,
  createTime: '2026-08-20T00:00:00.000Z',
})}\n${DATA_END}`

describe('extractDataBlock', () => {
  it('提取合法数据块', () => {
    const d = extractDataBlock(`描述\n\n${BLOCK}\n\n末尾`)!
    expect(d.name).toBe('戴森V8吸尘器')
    expect(d.lat).toBe(30.2745)
  })
  it('无数据块 / 损坏 JSON 返回 null', () => {
    expect(extractDataBlock('没有任何标记')).toBeNull()
    expect(extractDataBlock(`${DATA_START}\n{oops\n${DATA_END}`)).toBeNull()
  })
})

describe('parseIssue（Issue → Item）', () => {
  it('数据块映射：联系方式/定位/分类/创建时间', () => {
    const item = parseIssue(makeIssue({ body: BLOCK }))
    expect(item.id).toBe(7)
    expect(item.name).toBe('戴森V8吸尘器')
    expect(item.contactType).toBe('building')
    expect(item.contact).toBe('3栋1801')
    expect(item.lat).toBe(30.275)
    expect(item.lng).toBe(120.14)
    expect(item.category).toBe('electronics')
    expect(item.ownerPhone).toBe('13800000001')
    expect(item.borrowedBy).toBeUndefined()
    expect(item.status).toBe('available')
    expect(item.archived).toBe(false)
  })

  it('lent 标签 → 已借出；closed → 已下架', () => {
    const lent = parseIssue(makeIssue({ body: BLOCK, labels: [{ name: 'lent' }] }))
    expect(lent.status).toBe('lent')
    const closed = parseIssue(makeIssue({ body: BLOCK, state: 'closed' }))
    expect(closed.archived).toBe(true)
  })

  it('无数据块时用标题兜底，非法分类归 other、坐标 null', () => {
    const item = parseIssue(
      makeIssue({ title: '[闲置物品] 神秘物品', body: '没有数据块', labels: [{ name: 'x' }] }),
    )
    expect(item.name).toBe('神秘物品')
    expect(item.category).toBe('other')
    expect(item.lat).toBeNull()
    expect(item.status).toBe('available')
  })

  it('非 item 前缀标题原样保留', () => {
    expect(parseIssue(makeIssue({ title: '普通标题' })).name).toBe('普通标题')
  })

  it('拒绝 javascript: / 远程图片 URL', () => {
    const evil = `${DATA_START}\n${JSON.stringify({
      name: '陷阱',
      imgUrl: 'javascript:alert(1)',
    })}\n${DATA_END}`
    expect(parseIssue(makeIssue({ body: evil })).imgUrl).toBe('')
    const remote = `${DATA_START}\n${JSON.stringify({
      name: '外链',
      imgUrl: 'https://evil.example/x.png',
    })}\n${DATA_END}`
    expect(parseIssue(makeIssue({ body: remote })).imgUrl).toBe('')
  })
})
