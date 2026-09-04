// ================================================
// tests/itemops.test.ts — 借阅/归还/上下架 纯函数状态机 + 用户隔离
// 用户体系：登录手机号区分发布者（物主）与借阅者
// ================================================

import { describe, expect, it } from 'vitest'
import {
  borrowItem,
  canArchive,
  canBorrow,
  canDelete,
  canReturn,
  isOwner,
  returnItem,
} from '@/lib/itemOps'
import { isValidPhone, isValidBuilding } from '@/lib/validate'
import type { Item } from '@/lib/types'

function makeItem(partial: Partial<Item> = {}): Item {
  return {
    id: 1,
    name: '电钻',
    desc: '',
    contactType: 'phone',
    contact: '13800000001',
    imgUrl: '',
    status: 'available',
    ownerPhone: '13800000001',
    lat: 30,
    lng: 120,
    category: 'tools',
    rentType: 'free',
    rentFee: 0,
    createTime: '2026-06-01T00:00:00Z',
    ...partial,
  }
}

describe('isOwner（用户隔离）', () => {
  it('登录手机号与发布者一致 → 物主', () => {
    expect(isOwner(makeItem(), '13800000001')).toBe(true)
  })
  it('其他手机号 / 未登录 → 非物主', () => {
    expect(isOwner(makeItem(), '13900000002')).toBe(false)
    expect(isOwner(makeItem(), null)).toBe(false)
  })
})

describe('canBorrow / borrowItem（借用 → 已借出）', () => {
  it('已登录的非物主可借用可借物品', () => {
    expect(canBorrow(makeItem(), '13900000002')).toBe(true)
  })
  it('物主不能借用自己发布的物品', () => {
    expect(canBorrow(makeItem(), '13800000001')).toBe(false)
  })
  it('未登录 / 已借出 / 已下架 均不可借用', () => {
    expect(canBorrow(makeItem(), null)).toBe(false)
    expect(canBorrow(makeItem({ status: 'lent', borrowedBy: '13900000002' }), '13700000003')).toBe(false)
    expect(canBorrow(makeItem({ archived: true }), '13900000002')).toBe(false)
  })
  it('已下架且已借出仍不可再借', () => {
    expect(
      canBorrow(makeItem({ status: 'lent', borrowedBy: '13900000002', archived: true }), '13700000003'),
    ).toBe(false)
  })
  it('借用后状态变「已借出」并记录借阅人手机号与借出时间；入参不被修改', () => {
    const item = makeItem()
    const after = borrowItem(item, '13900000002')
    expect(after.status).toBe('lent')
    expect(after.borrowedBy).toBe('13900000002')
    expect(after.borrowedAt).toBeTruthy()
    expect(new Date(after.borrowedAt!).getTime()).not.toBeNaN()
    expect(item.status).toBe('available')
  })
})

describe('canReturn / returnItem（归还 → 可借）', () => {
  const lent = makeItem({ status: 'lent', borrowedBy: '13900000002' })

  it('只有借阅人本人可归还', () => {
    expect(canReturn(lent, '13900000002')).toBe(true)
    expect(canReturn(lent, '13800000001')).toBe(false)
    expect(canReturn(lent, '13700000003')).toBe(false)
    expect(canReturn(lent, null)).toBe(false)
    expect(canReturn(makeItem(), '13900000002')).toBe(false)
  })
  it('已下架的借出物品，借阅人仍可归还', () => {
    expect(canReturn(makeItem({ status: 'lent', borrowedBy: '13900000002', archived: true }), '13900000002')).toBe(
      true,
    )
  })
  it('归还后状态恢复「可借」且清空借阅人与借出时间', () => {
    const after = returnItem(lent)
    expect(after.status).toBe('available')
    expect(after.borrowedBy).toBeUndefined()
    expect(after.borrowedAt).toBeUndefined()
  })
})

describe('canArchive / canDelete（异常路径）', () => {
  const owner = '13800000001'
  const other = '13900000002'
  const lent = makeItem({ status: 'lent', borrowedBy: other })

  it('物主可下架可借物品；路人 / 未登录不可', () => {
    expect(canArchive(makeItem(), owner)).toBe(true)
    expect(canArchive(makeItem(), other)).toBe(false)
    expect(canArchive(makeItem(), null)).toBe(false)
  })
  it('已借出也可下架（从公开列表隐藏，不影响进行中的借用）', () => {
    expect(canArchive(lent, owner)).toBe(true)
    expect(canArchive(lent, other)).toBe(false)
  })
  it('已下架的物品物主仍可再操作上下架', () => {
    expect(canArchive(makeItem({ archived: true }), owner)).toBe(true)
  })
  it('物主可删除可借物品；路人不可', () => {
    expect(canDelete(makeItem(), owner)).toBe(true)
    expect(canDelete(makeItem(), other)).toBe(false)
    expect(canDelete(makeItem(), null)).toBe(false)
  })
  it('已借出不可删除，需先收回', () => {
    expect(canDelete(lent, owner)).toBe(false)
    expect(canDelete(lent, other)).toBe(false)
  })
  it('已下架但未借出，物主可删除', () => {
    expect(canDelete(makeItem({ archived: true }), owner)).toBe(true)
  })
  it('已下架且已借出，仍不可删除', () => {
    expect(canDelete(makeItem({ status: 'lent', borrowedBy: other, archived: true }), owner)).toBe(false)
  })
})

describe('联系方式校验（手机号 / 楼号 二选一）', () => {
  it('手机号：1[3-9] 开头 11 位数字才有效', () => {
    expect(isValidPhone('13812345678')).toBe(true)
    expect(isValidPhone('19912345678')).toBe(true)
    expect(isValidPhone(' 13812345678 ')).toBe(true)
    expect(isValidPhone('23812345678')).toBe(false)
    expect(isValidPhone('10012345678')).toBe(false)
    expect(isValidPhone('11012345678')).toBe(false)
    expect(isValidPhone('12012345678')).toBe(false)
    expect(isValidPhone('1381234567')).toBe(false)
    expect(isValidPhone('138123456789')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })
  it('楼号：非空即有效', () => {
    expect(isValidBuilding('3栋2单元1801')).toBe(true)
    expect(isValidBuilding('  ')).toBe(false)
  })
})
