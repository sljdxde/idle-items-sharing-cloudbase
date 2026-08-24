// ================================================
// tests/api.test.ts — 数据层契约测试
// buildPublishUrl 产物 = 用户在 GitHub 点 Submit 后的真实 Issue 内容；
// parseIssue 必须能无损读回。
// ================================================

import { describe, expect, it } from 'vitest'
import { buildPublishUrl, parseIssue, type RawIssue } from '@/lib/api'

const draft = {
  name: '儿童滑板车',
  desc: '九成新',
  contact: '微信 test-user',
  building: '',
  lat: 30.2741,
  lng: 120.1551,
  imgUrl: '',
  category: 'kids' as const,
}

describe('buildPublishUrl → parseIssue 往返一致性', () => {
  const url = buildPublishUrl(draft)

  it('URL 指向预填的 Issue 创建页且带 item 标签', () => {
    expect(url).toContain('https://github.com/sljdxde/idle-items-sharing-cloudbase/issues/new?')
    expect(url).toContain('labels=item')
    const params = new URL(url).searchParams
    expect(params.get('title')).toBe('[闲置物品] 儿童滑板车')
  })

  it('body 含隐藏 DATA 块，且字段完整可解析', () => {
    const params = new URL(url).searchParams
    const body = params.get('body') ?? ''
    expect(body).toMatch(/<!--DATA_START[\s\S]*DATA_END-->/)
    expect(body).toContain('请勿修改下方隐藏数据块')

    // 模拟 GitHub 存储后的 Issue 读回
    const dataJson = body.match(/<!--DATA_START([\s\S]*?)DATA_END-->/)![1].trim()
    const raw: RawIssue = {
      number: 99,
      title: '[闲置物品] 儿童滑板车',
      body,
      created_at: '2026-08-21T00:00:00Z',
      labels: [{ name: 'item' }],
    }
    const item = parseIssue(raw)!
    expect(item).not.toBeNull()
    expect(item.name).toBe('儿童滑板车')
    expect(item.category).toBe('kids')
    expect(item.status).toBe('available')
    expect(item.lat).toBeCloseTo(30.2741)
    expect(JSON.parse(dataJson)).toMatchObject({ category: 'kids', status: 'available' })
  })

  it('lent 标签优先级最高：覆盖 DATA 块里的历史状态（E2E 回归用例）', () => {
    const raw: RawIssue = {
      number: 98,
      title: '[闲置物品] 电钻',
      body: '<!--DATA_START\n{"name":"电钻","status":"available"}\nDATA_END-->',
      created_at: '2026-08-21T00:00:00Z',
      labels: [{ name: 'item' }, { name: 'lent' }],
    }
    expect(parseIssue(raw)!.status).toBe('borrowed')
  })

  it('无 lent 标签时回退 DATA 状态；都没有则 available', () => {
    const base: RawIssue = {
      number: 97,
      title: 'x',
      created_at: '2026-08-21T00:00:00Z',
      labels: [{ name: 'item' }],
    }
    expect(
      parseIssue({ ...base, body: '<!--DATA_START\n{"name":"a","status":"requested"}\nDATA_END-->' })!
        .status,
    ).toBe('requested')
    expect(parseIssue({ ...base, body: null })!.status).toBe('available')
  })
})
