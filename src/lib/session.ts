// ================================================
// src/lib/session.ts — 当前会话 token 的内存单一真相源
//
// 为什么需要它：auth store 把 JWT 放进 localStorage，但隐私模式/配额满时
// `localStorage.setItem` 会抛错（auth store 吞掉后仅留在内存）。若 api 层只从
// localStorage 取 token，就会出现「登录成功、之后所有写操作都 401」。
// 因此这里保存一份内存镜像：auth store 登录/登出时同步，api 取 token 时优先用它。
// 独立小模块是为了避免 api.ts ↔ stores/auth.ts 的循环依赖。
// ================================================

let memoryToken: string | null = null

/** 登录/注册成功或登出时调用；null 表示清空 */
export function setSessionToken(token: string | null): void {
  memoryToken = token && token.trim() ? token : null
}

/** 内存中的当前 token（未登录为 null） */
export function getSessionToken(): string | null {
  return memoryToken
}
