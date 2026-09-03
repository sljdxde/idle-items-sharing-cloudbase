/// <reference types="vite/client" />

// 构建时注入的版本信息（见 vite.config.ts 的 define），页脚用于确认部署是否生效
declare const __APP_VERSION__: string
declare const __COMMIT_HASH__: string
declare const __BUILD_TIME__: string
