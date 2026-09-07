// ================================================
// src/lib/pinInput.ts — 6格PIN输入框纯函数逻辑
// 提取自 LoginBox / AdminResetPage，便于单元测试
// ================================================

/**
 * 处理单个输入框的输入事件
 * 核心规则：只取最后一个数字字符，防止快速输入时多字符被追加到同一格
 * @param pinArr - PIN 数组（6个元素）
 * @param index - 当前输入框索引
 * @param rawValue - 输入框的原始值
 * @returns {{ value: string, shouldFocusNext: boolean }} 处理后的值和是否需要跳转到下一格
 */
export function handlePinInput(
  pinArr: string[],
  index: number,
  rawValue: string,
): { value: string; shouldFocusNext: boolean } {
  // 只取最后一个数字字符，防止快速输入时多字符被追加到同一格
  const val = rawValue.replace(/\D/g, '').slice(-1)
  pinArr[index] = val
  return {
    value: val,
    shouldFocusNext: !!val && index < 5,
  }
}

/**
 * 处理退格键事件
 * 规则：当前格为空且不是第一格时，清空上一格并跳转到上一格
 * @param pinArr - PIN 数组
 * @param index - 当前输入框索引
 * @param key - 按键名
 * @returns {{ shouldFocusPrev: boolean, clearPrev: boolean }} 是否需要跳转到上一格和是否需要清空上一格
 */
export function handlePinKeydown(
  pinArr: string[],
  index: number,
  key: string,
): { shouldFocusPrev: boolean; clearPrev: boolean } {
  if (key === 'Backspace' && !pinArr[index] && index > 0) {
    pinArr[index - 1] = ''
    return { shouldFocusPrev: true, clearPrev: true }
  }
  return { shouldFocusPrev: false, clearPrev: false }
}

/**
 * 处理粘贴事件
 * 规则：提取数字，截取前6位，分发到对应格子
 * @param pinArr - PIN 数组
 * @param clipboardText - 剪贴板文本
 * @returns {{ filledCount: number, shouldFocusIndex: number | null }} 填充的数量和需要聚焦的格子索引
 */
export function handlePinPaste(
  pinArr: string[],
  clipboardText: string,
): { filledCount: number; shouldFocusIndex: number | null } {
  const text = clipboardText.replace(/\D/g, '').slice(0, 6)
  text.split('').forEach((ch, i) => {
    pinArr[i] = ch
  })
  return {
    filledCount: text.length,
    shouldFocusIndex: text.length < 6 ? text.length : null,
  }
}

/**
 * PIN 数组拼接为字符串
 */
export function pinToString(pinArr: string[]): string {
  return pinArr.join('')
}

/**
 * 清空 PIN 数组
 */
export function clearPinArray(pinArr: string[]): void {
  for (let i = 0; i < 6; i++) pinArr[i] = ''
}

/**
 * 创建空的 PIN 数组
 */
export function createEmptyPin(): string[] {
  return ['', '', '', '', '', '']
}

/**
 * 检查 PIN 是否完整（6位都有值）
 */
export function isPinComplete(pinArr: string[]): boolean {
  return pinArr.every((v) => /^\d$/.test(v))
}
