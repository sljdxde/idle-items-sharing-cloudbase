// ================================================
// cloudflare-worker/moderation.js — 发布内容安全审核（文本 + 图片硬性校验）
// 覆盖类目：色情低俗 / 赌博 / 毒品 / 暴力与违禁品
// 用法：
//   moderateText('标题 描述 联系方式') → { pass: true } | { pass: false, category, reason }
//   checkImageDataUrl(dataUrl)        → { ok: true } | { ok: false, reason }
// 纯函数、零外部依赖；Worker / Pages / Node 通用，可单测。
// 说明：文本审核为强拦截；图片做格式/魔数硬性校验，
// 真正的图像内容识别（视觉模型）需接入外部内容安全服务，见仓库 ADR 讨论。
// ================================================

/** 归一化：小写、全角→半角、去空白与常见标点分隔（用于对抗"加空格/符号"绕过） */
export function normalizeForScan(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/[\s\u0000-\u001f\u00a0]/g, '')
    .replace(/[_\-—–.,，。!！?？;；:：'"“”‘’()（）[\]【】{}<>《》/\\|*+#@&^%$~`·、]/g, '')
    .replace(/[\uff65-\uff9f]/g, '')
}

// ── 分类词库（归一化形态；命中任一即拦截）──
// 词条聚焦明确违法违规行为/物品，避免误伤正常生活用语（如棋牌、菜刀、日用刀具不收录）。
const RULES = [
  {
    category: '色情低俗',
    reason: '内容涉嫌色情低俗，禁止发布',
    words: [
      '色情', '情色', '黄色视频', '黄色电影', '黄网', '成人网站', '成人视频', '成人影片', 'av资源', 'av片',
      '裸聊', '裸照', '裸贷', '裸体视频', '援交', '约炮', '一夜情', '卖淫', '嫖娼', '招嫖', '买春', '卖春',
      '性交易', '淫秽', '福利姬', '黄色图片', '大尺度', '露点', '走光图', '自慰', '性交', '做爱视频',
      '原味内衣', '原味袜', '原味丝袜',
      'yp', 'ypd', 'yyp',
    ],
  },
  {
    category: '赌博',
    reason: '内容涉嫌赌博，禁止发布',
    words: [
      '赌博', '赌场', '博彩', '六合彩', '时时彩', '百家乐', '老虎机', '赌球', '赌大小', '赌钱',
      '网络赌博', '网赌', '外围投注', '外围下注', '私彩', '赌博网站', '真人博彩', '线上赌场',
      '开奖号码', '投注平台', '电子赌博', '赌博机', 'gp', 'bc', 'dc',
    ],
  },
  {
    category: '毒品',
    reason: '内容涉嫌毒品，禁止发布',
    words: [
      '毒品', '冰毒', '海洛因', '大麻', '摇头丸', '可卡因', '吗啡', '鸦片', 'k粉', 'k仔', '麻古',
      '麻果', '吸毒', '贩毒', '制毒', '甲基苯丙胺', '冰壶', '笑气', '迷药', '迷魂药', '听话水',
      '催情水', 'ghb', 'lsd', 'mdma', '冰毒片', '吸毒工具', 'dp',
    ],
  },
  {
    category: '暴力违禁品',
    reason: '内容涉及暴力或违禁品，禁止发布',
    words: [
      '枪支', '弹药', '仿真枪', '管制刀具', '弓弩', '炸弹', '爆炸物', '雷管', '火药', '手雷',
      '军用匕首', '军刀', '甩棍', '电击棒', '催泪喷雾', '管制物品', '危险品', '赌博工具',
      '杀人', '砍人', '恐怖袭击', '制爆',
    ],
  },
]

/** 命中即返回 { pass:false, category, reason }；否则 { pass:true } */
export function moderateText(text) {
  const norm = normalizeForScan(text)
  if (!norm) return { pass: true }
  for (const rule of RULES) {
    for (const w of rule.words) {
      if (norm.includes(w)) {
        return { pass: false, category: rule.category, reason: rule.reason }
      }
    }
  }
  return { pass: true }
}

// ── 图片硬性校验：必须是 jpeg/png/webp 的真实文件（校验文件头魔数）──
const MAGIC = [
  { label: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { label: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { label: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF，再校验第 8-11 字节为 WEBP
]

/** 校验 data:image/*;base64, 的真实内容格式；合法返回 { ok:true } */
export function checkImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return { ok: false, reason: '图片缺失' }
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+=*)$/i.exec(dataUrl.trim())
  if (!m) return { ok: false, reason: '图片格式不支持，仅支持 jpeg/png/webp' }
  const type = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase()
  let bytes
  try {
    bytes = base64ToBytes(m[2])
  } catch {
    return { ok: false, reason: '图片数据损坏' }
  }
  if (bytes.length < 16) return { ok: false, reason: '图片内容无效' }
  if (type === 'jpeg') {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return { ok: false, reason: '图片内容与格式不符' }
    }
    return { ok: true }
  }
  if (type === 'png') {
    if (!MAGIC[1].bytes.every((b, i) => bytes[i] === b)) {
      return { ok: false, reason: '图片内容与格式不符' }
    }
    return { ok: true }
  }
  // webp：RIFF....WEBP
  if (
    bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50
  ) {
    return { ok: false, reason: '图片内容与格式不符' }
  }
  return { ok: true }
}

/** 宽松 base64 解码（容忍换行）；非法输入抛错 */
export function base64ToBytes(b64) {
  const clean = String(b64).replace(/[\r\n\s]/g, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
