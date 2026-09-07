// ================================================
// src/lib/validate.ts — 输入校验（纯函数）
// ================================================

/** 大陆手机号：1[3-9] 开头共 11 位数字（排除 10/11/12 服务号段） */
export function isValidPhone(v: string): boolean {
  return /^1[3-9]\d{9}$/.test(v.trim())
}

/** 楼号门牌：非空即有效（长度上限由输入框 maxlength 保证） */
export function isValidBuilding(v: string): boolean {
  return v.trim().length > 0
}

/** 常见弱PIN黑名单 */
const WEAK_PINS = new Set([
  '123456', '654321', '012345', '987654',
  '111111', '000000', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
  '123123', '321321', '121212', '212121', '112233', '332211', '123321',
  '111222', '222111', '000111', '111000',
  '135790', '246801', '024680',
])

/**
 * 判断是否为弱PIN（6位数字）
 * 规则：6位相同 / 连续递增递减 / 常见弱PIN黑名单
 */
export function isWeakPin(pin: string): boolean {
  if (pin.length !== 6 || !/^\d{6}$/.test(pin)) return true
  if (WEAK_PINS.has(pin)) return true
  // 连续递增（含循环 012345）
  const digits = pin.split('').map(Number)
  let ascending = true
  let descending = true
  for (let i = 1; i < 6; i++) {
    if (digits[i] !== (digits[i - 1] + 1) % 10) ascending = false
    if (digits[i] !== (digits[i - 1] + 9) % 10) descending = false
  }
  return ascending || descending
}

/** 弱PIN的友好提示文案 */
export function weakPinHint(pin: string): string {
  if (/^(\d)\1{5}$/.test(pin)) return '管理口令不能是 6 个相同数字'
  if (isWeakPin(pin)) return '管理口令过于简单（如 123456、连续数字），请换一个'
  return ''
}
