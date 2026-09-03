import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// ── 构建时版本信息（vite define 注入，部署后页脚可见，用于确认部署是否生效）──
function buildMeta() {
  let commit = 'unknown'
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    /* 非 git 环境 */
  }
  let version = '0.0.0'
  try {
    version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
  } catch {
    /* 缺 package.json */
  }
  return { version, commit, time: new Date().toISOString() }
}
const meta = buildMeta()

// base './' + IIFE 单文件经典脚本：
// 离线 zip 容器 CSP 禁止 type="module"/内联脚本/外部资源，
// 因此构建产物必须是相对路径引用的经典 <script src>。
export default defineConfig({
  plugins: [vue()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(meta.version),
    __COMMIT_HASH__: JSON.stringify(meta.commit),
    __BUILD_TIME__: JSON.stringify(meta.time),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    sourcemap: false,
    // 容器内可能是较老的系统 WebView，显式降目标以转译 ?. / ?? 等新语法
    target: 'es2018',
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
