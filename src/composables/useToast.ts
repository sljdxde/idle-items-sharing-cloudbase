// ================================================
// src/composables/useToast.ts — 轻量通知（模块级单例）
// 替代原生 alert；ToastHost 组件负责渲染
// ================================================

import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  type: ToastType
  title: string
  msg?: string
}

let seq = 0
const toasts = reactive<ToastItem[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
}

function push(type: ToastType, title: string, msg?: string, duration = 2800): void {
  const id = ++seq
  toasts.push({ id, type, title, msg })
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismiss(id), duration),
    )
  }
}

export function useToast() {
  return {
    toasts,
    dismiss,
    success: (title: string, msg?: string, d?: number) =>
      push('success', title, msg, d),
    error: (title: string, msg?: string, d?: number) => push('error', title, msg, d),
    info: (title: string, msg?: string, d?: number) => push('info', title, msg, d),
    warning: (title: string, msg?: string, d?: number) =>
      push('warning', title, msg, d),
  }
}
