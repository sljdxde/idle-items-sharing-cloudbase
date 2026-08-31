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
