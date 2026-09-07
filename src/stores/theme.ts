// ================================================
// src/stores/theme.ts — 三主题切换 store
// 主题：memphis（默认）/ brutalism / editorial
// 持久化：localStorage key = llhw-theme
// ================================================

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeId = 'memphis' | 'brutalism' | 'editorial'

const STORAGE_KEY = 'llhw-theme'
const VALID_THEMES: ThemeId[] = ['memphis', 'brutalism', 'editorial']

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && (VALID_THEMES as string[]).includes(raw)) {
      return raw as ThemeId
    }
  } catch {
    // localStorage 不可用时回退默认
  }
  return 'memphis'
}

function applyTheme(theme: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeId>(readStoredTheme())

  // 初始化时立即应用到 documentElement
  applyTheme(theme.value)

  function setTheme(id: ThemeId): void {
    if (!(VALID_THEMES as string[]).includes(id)) {
      id = 'memphis'
    }
    theme.value = id
  }

  // 监听变化：写 DOM + localStorage
  watch(theme, (val) => {
    applyTheme(val)
    try {
      localStorage.setItem(STORAGE_KEY, val)
    } catch {
      // 忽略写入失败
    }
  })

  return { theme, setTheme }
})
