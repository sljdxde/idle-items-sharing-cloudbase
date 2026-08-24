import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './' + IIFE 单文件经典脚本：
// 离线 zip 容器 CSP 禁止 type="module"/内联脚本/外部资源，
// 因此构建产物必须是相对路径引用的经典 <script src>。
export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: (info) =>
          info.names?.[0]?.endsWith('.css') ? 'assets/style.css' : 'assets/[name][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
