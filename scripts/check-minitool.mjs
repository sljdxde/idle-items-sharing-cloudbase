// ================================================
// scripts/check-minitool.mjs — 小工具包静态合规扫描
// 依据 .skill/SKILL.md 及其 references 的自检清单逐项核对 dist/
// 全过 → exit 0；任一 FAIL → exit 1（阻断打包）
// ================================================

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const ROOT = process.argv[2] ?? 'dist'
const results = []
const note = (msg) => console.log('  · ' + msg)
const pass = (id, msg) => { results.push(true); console.log(`PASS ${id} ${msg}`) }
const fail = (id, msg) => { results.push(false); console.log(`FAIL ${id} ${msg}`) }

// ---------- 收集文件 ----------
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const files = walk(ROOT).map((p) => ({ path: relative(ROOT, p), abs: p }))

console.log(`\n══ 小工具合规扫描：${ROOT}/（${files.length} 个文件）══\n`)

// ---------- §1 结构 ----------
const hasIndex = files.some((f) => f.path === 'index.html')
hasIndex ? pass('S1', 'index.html 位于根目录') : fail('S1', '缺少根目录 index.html')

const ALLOWED = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json'])
const badType = files.filter((f) => !ALLOWED.has(extname(f.path).toLowerCase()))
badType.length === 0
  ? pass('S2', '仅含允许的文件类型')
  : fail('S2', `不允许的类型：${badType.map((f) => f.path).join(', ')}`)

const junk = files.filter((f) =>
  /(^|\/)(node_modules|\.git)(\/|$)|\.DS_Store$|\.map$|vite\.config|webpack\.config/.test(f.path),
)
junk.length === 0 ? pass('S3', '无开发垃圾文件') : fail('S3', junk.map((f) => f.path).join(', '))

// ---------- §5 index.html 模板 ----------
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')

const RE_DOCTYPE = /<!DOCTYPE\s+html/i
const RE_LANG = /<html[^>]*\slang=["']zh-CN["']/i
const RE_CHARSET = /charset=["']?utf-8/i

RE_DOCTYPE.test(html) ? pass('H1', '有 DOCTYPE') : fail('H1', '缺 DOCTYPE')
RE_LANG.test(html) ? pass('H2', 'lang=zh-CN') : fail('H2', 'lang 非 zh-CN')
RE_CHARSET.test(html) ? pass('H3', 'charset UTF-8') : fail('H3', '缺 charset')
const vp = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/i)?.[0] ?? ''
const vpOk = /width=device-width/i.test(vp) && /initial-scale=1\.0/i.test(vp) && /viewport-fit=cover/i.test(vp)
vpOk ? pass('H4', 'viewport 含 device-width / initial-scale / viewport-fit') : fail('H4', `viewport 不合规：${vp}`)
const RE_BASE = /<base\s/i
const RE_FRAME = /<iframe|<object/i
const RE_CSP_META = /http-equiv=["']content-security-policy/i

RE_BASE.test(html) ? fail('H5', '存在 <base>') : pass('H5', '无 <base>')
RE_FRAME.test(html) ? fail('H6', '存在 iframe/object') : pass('H6', '无 iframe/object')
RE_CSP_META.test(html) ? fail('H7', '自建 CSP meta') : pass('H7', '无自建 CSP')

// ---------- 脚本形态 ----------
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1], body: m[2] }))
scripts.every((s) => s.body.trim() === '')
  ? pass('J1', '无内联脚本内容')
  : fail('J1', '存在内联 <script> 内容')
scripts.every((s) => !/type=["']module["']/i.test(s.attrs))
  ? pass('J2', '无 type="module"')
  : fail('J2', '脚本为 module 形态')
// head 内经典外置脚本必须 defer，否则先于 #app 执行导致挂载失败
const headScriptOk = scripts.every(
  (s) => !/\bsrc=/.test(s.attrs) || /\bdefer\b/.test(s.attrs) || /<\/body>/i.test(s.attrs),
)
headScriptOk ? pass('J5', '入口脚本 defer（不阻塞解析）') : fail('J5', 'head 脚本缺 defer')
scripts.every((s) => /\bsrc=["']\.?\//.test(s.attrs))
  ? pass('J3', '脚本全部外置且相对路径引用')
  : fail('J3', '存在无 src 或绝对路径脚本')
const RE_INLINE_EVENT = /onclick=|onchange=|onsubmit=|javascript:/i
RE_INLINE_EVENT.test(html)
  ? fail('J4', '存在行内事件/javascript: URI')
  : pass('J4', '无行内事件与 javascript: URI')

// ---------- 资源引用 ----------
const refRe = /(?:src|href)=["']([^"']+)["']|url\((['"]?)([^)'"]+)\2\)/g
let extRefs = []
for (const m of html.matchAll(refRe)) {
  const v = m[1] ?? m[3]
  if (/^(https?:)?\/\//i.test(v)) extRefs.push(v)
}
// 扫描所有 css/js 内的外链资源
for (const f of files.filter((f) => /\.(css|js)$/i.test(f.path))) {
  const text = readFileSync(f.abs, 'utf8')
  for (const m of text.matchAll(/url\(\s*['"]?(https?:\/\/[^'")\s]+)/g)) extRefs.push(`${f.path}: ${m[1]}`)
  for (const m of text.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/g)) extRefs.push(`${f.path}: ${m[1]}`)
}
extRefs.length === 0
  ? pass('R1', '零外部资源引用（全离线）')
  : fail('R1', `外部引用 ${extRefs.length} 处：${[...new Set(extRefs)].slice(0, 8).join(' | ')}`)

// 引用的本地资源都存在
const missing = []
for (const m of html.matchAll(/(?:src|href)=["'](\.?\/?[^"'h][^"']*)["']/g)) {
  const rel = m[1].replace(/^\.\//, '').split('#')[0].split('?')[0]
  if (!rel || rel.startsWith('data:')) continue
  if (!files.some((f) => f.path === rel)) missing.push(rel)
}
missing.length === 0 ? pass('R2', '引用资源均在包内') : fail('R2', `缺失：${missing.join(', ')}`)

// ---------- 禁用能力扫描（device-capabilities.md §7） ----------
const FORBIDDEN = [
  [/fetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+WebSocket\s*\(/, 'WebSocket'],
  [/new\s+EventSource\s*\(/, 'EventSource'],
  [/new\s+RTCPeerConnection\s*\(/, 'RTCPeerConnection'],
  [/navigator\.geolocation/, 'geolocation'],
  [/clipboard\.(readText|writeText)/, 'clipboard API'],
  [/execCommand\s*\(\s*['"](copy|cut|paste)/, 'execCommand 复制'],
  [/navigator\.(bluetooth|usb|hid|serial)/, '硬件连接'],
  [/navigator\.(getBattery|connection|credentials|locks)/, '设备信息/凭据'],
  [/mediaDevices\.enumerateDevices|getDisplayMedia/, '设备枚举/屏幕共享'],
  [/storage\.persist/, '持久化申请'],
  [/serviceWorker\.register/, 'Service Worker'],
  [/new\s+(Shared)?Worker\s*\(/, 'Web Worker'],
  [/new\s+(Accelerometer|Gyroscope|Magnetometer)\s*\(/, '传感器'],
  [/Device(Motion|Orientation)Event|devicemotion|deviceorientation/, '动作传感器'],
  [/requestFullscreen/, '全屏 API'],
  [/\beval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function'],
  [/WebAssembly/, 'WebAssembly'],
  [/\bwindow\.open\s*\(/, 'window.open'],
  [/\bwindow\.prompt\s*\(/, 'window.prompt'],
  [/location\.(assign|href\s*=)/, '站外跳转'],
  [/target=["']_blank["']/, 'target=_blank'],
  [/\sdownload\s*=/, 'a[download]'],
]
const codeFiles = files.filter((f) => /\.(js|html|css)$/i.test(f.path))
const hits = []
for (const f of codeFiles) {
  const text = readFileSync(f.abs, 'utf8')
  for (const [re, label] of FORBIDDEN) {
    if (re.test(text)) hits.push(`${f.path} → ${label}`)
  }
}
hits.length === 0
  ? pass('D1', '禁用能力零调用、零残留')
  : fail('D1', `${hits.length} 处命中：${hits.slice(0, 10).join(' | ')}`)

// ---------- 允许能力提示 ----------
const js = readFileSync(files.find((f) => f.path.endsWith('.js'))?.abs ?? '', 'utf8')
if (/localStorage|sessionStorage|IndexedDB/.test(js)) note('使用本地存储（容器内按小工具隔离，允许）')
if (/getUserMedia|type=["']file["']/.test(js + html)) note('含相机/选图能力（须用户手势触发，允许）')

// ---------- 汇总 ----------
const failed = results.filter((x) => !x).length
console.log(`\n══ 结果：${results.length - failed}/${results.length} 通过 ══\n`)
process.exit(failed ? 1 : 0)
