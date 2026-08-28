// ================================================
// src/lib/clipboard.ts — 剪贴板复制（失败返回 false，调用方降级为手动复制提示）
// ================================================

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
