// ================================================
// tests/gen-items.test.ts — 静态快照 items.json 的映射规则
//
// 这条链路以前单独抄了一份 parseIssue，漏了 rentType/rentFee/rentRecords，
// 结果「从快照读到的物品全是免费、租金统计恒为 0」，要等实时校准才纠正。
// 现在统一走 cloudflare-worker/items.js 的 toItem，这里守住三件事：
// 1) 租金字段必须在快照里；2) 已下架物品的联系方式必须打码；3) 图片与描述仍被收敛
// ================================================

import { describe, expect, it } from 'vitest'
import { parseIssue } from '../scripts/gen-items.mjs'

function makeIssue(data: Record<string, unknown>, state: 'open' | 'closed' = 'open', labels = ['item']) {
  return {
    number: 42,
    title: '[闲置物品] 冲击钻',
    state,
    created_at: '2026-09-01T00:00:00.000Z',
    labels: labels.map((name) => ({ name })),
    body: `公开描述\n\n<!--DATA_START\n${JSON.stringify(data)}\nDATA_END-->\n`,
  }
}

describe('gen-items：快照映射', () => {
  it('租金字段不能丢（历史 bug：快照里没有 rentType，全站显示免费）', () => {
    const item = parseIssue(
      makeIssue({ name: '冲击钻', rentType: 'daily', rentFee: 5, rentRecords: [{ fee: 10 }] }),
    )
    expect(item.rentType).toBe('daily')
    expect(item.rentFee).toBe(5)
    expect(item.rentRecords).toHaveLength(1)
  })

  it('已下架物品的联系方式在匿名快照里打码', () => {
    const open = parseIssue(makeIssue({ name: '冲击钻', contact: '13800000001' }))
    expect(open.contact).toBe('13800000001')
    expect(open.archived).toBe(false)

    const closed = parseIssue(makeIssue({ name: '冲击钻', contact: '13800000001' }, 'closed'))
    expect(closed.archived).toBe(true)
    expect(closed.contact).toBe('')
  })

  it('状态以 borrowerHash 为准（标签写失败也算已借出）', () => {
    const item = parseIssue(makeIssue({ name: '冲击钻', borrowerHash: 'hash-b' }, 'open', ['item']))
    expect(item.status).toBe('lent')

    const available = parseIssue(makeIssue({ name: '冲击钻' }))
    expect(available.status).toBe('available')
  })

  it('图片只留白名单地址，描述截到 300 字', () => {
    const bad = parseIssue(makeIssue({ name: 'x', imgUrl: 'javascript:alert(1)' }))
    expect(bad.imgUrl).toBe('')

    const good = parseIssue(makeIssue({ name: 'x', imgUrl: '/uploads/a.jpg' }))
    expect(good.imgUrl).toBe('/uploads/a.jpg')

    const long = parseIssue(makeIssue({ name: 'x', desc: '字'.repeat(500) }))
    expect(long.desc).toHaveLength(300)
  })

  it('数据块损坏时退回标题，不抛异常', () => {
    const broken = {
      number: 7,
      title: '[闲置物品] 折叠梯',
      state: 'open',
      created_at: '2026-09-01T00:00:00.000Z',
      labels: [{ name: 'item' }],
      body: '没有数据块',
    }
    const item = parseIssue(broken)
    expect(item.name).toBe('折叠梯')
    expect(item.id).toBe(7)
    expect(item.contact).toBe('')
  })
})
