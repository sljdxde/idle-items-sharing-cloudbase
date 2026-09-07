// ================================================
// tests/pin-input.test.ts — 6格PIN输入框逻辑单元测试
// 覆盖：输入处理、退格回跳、粘贴分发、拼接、清空、完整性检查
// ================================================

import { describe, expect, it } from 'vitest'
import {
  handlePinInput,
  handlePinKeydown,
  handlePinPaste,
  pinToString,
  clearPinArray,
  createEmptyPin,
  isPinComplete,
} from '@/lib/pinInput'

describe('handlePinInput — 输入处理', () => {
  it('正常输入单个数字', () => {
    const pin = createEmptyPin()
    const result = handlePinInput(pin, 0, '9')
    expect(result.value).toBe('9')
    expect(result.shouldFocusNext).toBe(true)
    expect(pin[0]).toBe('9')
  })

  it('只取最后一个数字字符（防止多字符追加）', () => {
    const pin = createEmptyPin()
    // 模拟快速输入时，输入框可能包含多个字符
    const result = handlePinInput(pin, 0, '91')
    expect(result.value).toBe('1')
    expect(pin[0]).toBe('1')
  })

  it('过滤非数字字符', () => {
    const pin = createEmptyPin()
    const result = handlePinInput(pin, 0, 'a9b')
    expect(result.value).toBe('9')
    expect(pin[0]).toBe('9')
  })

  it('输入空值时不跳转', () => {
    const pin = createEmptyPin()
    pin[0] = '9'
    const result = handlePinInput(pin, 0, '')
    expect(result.value).toBe('')
    expect(result.shouldFocusNext).toBe(false)
    expect(pin[0]).toBe('')
  })

  it('最后一格输入后不跳转', () => {
    const pin = createEmptyPin()
    const result = handlePinInput(pin, 5, '0')
    expect(result.value).toBe('0')
    expect(result.shouldFocusNext).toBe(false)
    expect(pin[5]).toBe('0')
  })

  it('连续输入6个数字，每格都正确存储', () => {
    const pin = createEmptyPin()
    const digits = ['9', '1', '1', '2', '2', '0']
    digits.forEach((d, i) => {
      handlePinInput(pin, i, d)
    })
    expect(pinToString(pin)).toBe('911220')
  })

  it('模拟快速输入场景（焦点跳转不及时导致多字符）', () => {
    const pin = createEmptyPin()
    // 第1格输入 '9'
    handlePinInput(pin, 0, '9')
    // 模拟焦点还没跳走，用户又输入了 '1'，输入框变成 '91'
    const result = handlePinInput(pin, 0, '91')
    // 应该只取最后一个字符 '1'，覆盖之前的 '9'
    expect(result.value).toBe('1')
    expect(pin[0]).toBe('1')
  })
})

describe('handlePinKeydown — 退格回跳', () => {
  it('当前格为空时，退格清空上一格并跳转', () => {
    const pin = createEmptyPin()
    pin[0] = '9'
    pin[1] = ''
    const result = handlePinKeydown(pin, 1, 'Backspace')
    expect(result.shouldFocusPrev).toBe(true)
    expect(result.clearPrev).toBe(true)
    expect(pin[0]).toBe('')
  })

  it('当前格有值时，退格不跳转（由浏览器默认行为删除当前字符）', () => {
    const pin = createEmptyPin()
    pin[0] = '9'
    pin[1] = '1'
    const result = handlePinKeydown(pin, 1, 'Backspace')
    expect(result.shouldFocusPrev).toBe(false)
    expect(result.clearPrev).toBe(false)
    expect(pin[1]).toBe('1')
  })

  it('第一格退格不跳转', () => {
    const pin = createEmptyPin()
    const result = handlePinKeydown(pin, 0, 'Backspace')
    expect(result.shouldFocusPrev).toBe(false)
    expect(result.clearPrev).toBe(false)
  })

  it('非退格键不触发跳转', () => {
    const pin = createEmptyPin()
    pin[0] = '9'
    const result = handlePinKeydown(pin, 1, 'Enter')
    expect(result.shouldFocusPrev).toBe(false)
  })
})

describe('handlePinPaste — 粘贴分发', () => {
  it('粘贴6位数字，正确分发到6格', () => {
    const pin = createEmptyPin()
    const result = handlePinPaste(pin, '911220')
    expect(result.filledCount).toBe(6)
    expect(result.shouldFocusIndex).toBeNull()
    expect(pinToString(pin)).toBe('911220')
  })

  it('粘贴不足6位，分发后跳转到下一个空格里', () => {
    const pin = createEmptyPin()
    const result = handlePinPaste(pin, '911')
    expect(result.filledCount).toBe(3)
    expect(result.shouldFocusIndex).toBe(3)
    expect(pin[0]).toBe('9')
    expect(pin[1]).toBe('1')
    expect(pin[2]).toBe('1')
    expect(pin[3]).toBe('')
  })

  it('粘贴包含非数字字符，自动过滤', () => {
    const pin = createEmptyPin()
    const result = handlePinPaste(pin, 'PIN: 911-220')
    expect(result.filledCount).toBe(6)
    expect(pinToString(pin)).toBe('911220')
  })

  it('粘贴超过6位，只取前6位', () => {
    const pin = createEmptyPin()
    const result = handlePinPaste(pin, '911220123456')
    expect(result.filledCount).toBe(6)
    expect(pinToString(pin)).toBe('911220')
  })

  it('粘贴空字符串，不填充', () => {
    const pin = createEmptyPin()
    const result = handlePinPaste(pin, '')
    expect(result.filledCount).toBe(0)
    expect(result.shouldFocusIndex).toBe(0)
  })
})

describe('pinToString — 拼接', () => {
  it('空数组拼接为空字符串', () => {
    expect(pinToString(createEmptyPin())).toBe('')
  })

  it('完整PIN拼接正确', () => {
    const pin = ['9', '1', '1', '2', '2', '0']
    expect(pinToString(pin)).toBe('911220')
  })

  it('部分填充拼接正确', () => {
    const pin = ['9', '1', '', '', '', '']
    expect(pinToString(pin)).toBe('91')
  })
})

describe('clearPinArray — 清空', () => {
  it('清空所有格子', () => {
    const pin = ['9', '1', '1', '2', '2', '0']
    clearPinArray(pin)
    expect(pin).toEqual(['', '', '', '', '', ''])
  })
})

describe('createEmptyPin — 创建空数组', () => {
  it('创建6个空字符串的数组', () => {
    const pin = createEmptyPin()
    expect(pin).toHaveLength(6)
    expect(pin.every((v) => v === '')).toBe(true)
  })
})

describe('isPinComplete — 完整性检查', () => {
  it('完整PIN返回true', () => {
    const pin = ['9', '1', '1', '2', '2', '0']
    expect(isPinComplete(pin)).toBe(true)
  })

  it('不完整PIN返回false', () => {
    const pin = ['9', '1', '1', '2', '2', '']
    expect(isPinComplete(pin)).toBe(false)
  })

  it('包含非数字字符返回false', () => {
    const pin = ['9', '1', '1', '2', '2', 'a']
    expect(isPinComplete(pin)).toBe(false)
  })

  it('空数组返回false', () => {
    expect(isPinComplete(createEmptyPin())).toBe(false)
  })
})
