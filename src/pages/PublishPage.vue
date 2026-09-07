<script setup lang="ts">
// ================================================
// PublishPage — 发布闲置：自动获取定位 + 联系方式（手机号/楼号 二选一）
// 未登录先展示登录卡；发布数据（含定位）保存到本地
// ================================================

import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { PUBLISH_CATEGORIES } from '@/lib/categories'
import type { CategoryId, ContactType } from '@/lib/types'
import { isValidPhone } from '@/lib/validate'
import { compressToFit } from '@/lib/image'
import { IS_SERVER_CHANNEL } from '@/lib/api'
import type { LocateFailReason } from '@/lib/geo'
import LoginBox from '@/components/LoginBox.vue'

/**
 * 图片体积预算（字节）：
 * - 服务器通道：图片由服务端落盘，上限 100KB（保画质）
 * - pages.dev / github.io：图片内嵌 Issue 正文（上限 64KB），36KB ≈ base64 4.9 万字符
 */
const IMG_BUDGET_BYTES = IS_SERVER_CHANNEL ? 100 * 1024 : 36 * 1024

const store = useItemsStore()
const auth = useAuthStore()
const toast = useToast()
const router = useRouter()

const name = ref('')
const desc = ref('')
const category = ref<CategoryId>('other')
const publishing = ref(false)
const imgError = ref('')
const compressing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
/** 上传图片压缩后的 data URI（可选） */
const imgDataUri = ref('')

// 联系方式：楼号门牌 / 手机号 二选一（楼号优先）
const contactType = ref<ContactType>('building')
const contact = ref('')
const rentType = ref<'free' | 'daily' | 'perUse'>('free')
const rentFee = ref('')

// 定位状态：细分失败原因（HTTP 禁用 / 拒绝 / 超时），提示更准确
const locating = ref(false)
const locateState = ref<'idle' | 'ok' | LocateFailReason>('idle')

const contactLabel = computed(() => (contactType.value === 'phone' ? '手机号' : '楼号门牌'))
const contactPlaceholder = computed(() =>
  contactType.value === 'phone' ? '例如：13812345678' : '例如：3 栋 2 单元 1801',
)

onMounted(() => {
  void tryLocate()
})

async function tryLocate(): Promise<void> {
  locating.value = true
  const r = await store.locate()
  locating.value = false
  locateState.value = r
}

function validateContact(): boolean {
  const v = contact.value.trim()
  if (!v) {
    toast.warning('请填写联系方式', `${contactLabel.value}为必填项`)
    return false
  }
  if (contactType.value === 'phone' && !isValidPhone(v)) {
    toast.warning('手机号格式不正确', '需为 1 开头 11 位数字')
    return false
  }
  return true
}

async function onPickImage(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  imgError.value = ''
  compressing.value = true
  try {
    // 服务器通道预算更宽（100KB），起点尺寸/质量更高以保画质；
    // 其余通道必须压进内嵌预算，小图原样通过、大图逐步压缩
    const uri = await compressToFit(
      file,
      IMG_BUDGET_BYTES,
      IS_SERVER_CHANNEL ? { maxSide: 900, quality: 0.75 } : {},
    )
    if (!uri) {
      imgError.value = '这张图太大，压缩后仍超出体积上限。可换张小图，或不带图发布'
      imgDataUri.value = ''
      return
    }
    imgDataUri.value = uri
  } catch {
    imgError.value = '图片处理失败，请换一张图片试试'
    imgDataUri.value = ''
  } finally {
    compressing.value = false
  }
}

function clearImage(): void {
  imgDataUri.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

async function onSubmit(): Promise<void> {
  if (publishing.value) return
  if (!name.value.trim() || !desc.value.trim()) {
    toast.warning('信息不完整', '请填写物品名称和描述')
    return
  }
  if (!validateContact()) return

  const rentTypeVal = rentType.value
  const rentFeeNum = Number(rentFee.value)
  if (rentTypeVal !== 'free') {
    if (
      !rentFee.value.trim() ||
      !Number.isFinite(rentFeeNum) ||
      rentFeeNum <= 0 ||
      rentFeeNum > 100000
    ) {
      toast.warning('请填写正确的租金', '按天/按次计费时，请填写大于 0 且不超过 100000 的金额')
      return
    }
  }

  publishing.value = true
  try {
    const ok = await store.publish({
      name: name.value,
      desc: desc.value,
      contactType: contactType.value,
      contact: contact.value,
      imgUrl: imgDataUri.value,
      category: category.value,
      position: store.userPosition,
      rentType: rentTypeVal,
      rentFee: rentTypeVal === 'free' ? 0 : rentFeeNum,
    })
    if (ok) {
      name.value = ''
      desc.value = ''
      contact.value = ''
      rentType.value = 'free'
      rentFee.value = ''
      imgDataUri.value = ''
      if (fileInput.value) fileInput.value.value = ''
      router.push('/')
    }
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <main class="container publish-main">
    <!-- ① 未登录：先登录 -->
    <div v-if="!auth.isLoggedIn" class="form-shell">
      <span class="hero-tape" aria-hidden="true"></span>
      <h1 class="form-title">发布闲置物品</h1>
      <p class="form-sub">发布需要先登录——用你的手机号，邻居们也能借此联系你</p>
      <LoginBox />
    </div>

    <!-- ② 已登录：发布表单 -->
    <div v-else class="form-shell">
      <span class="hero-tape" aria-hidden="true"></span>
      <h1 class="form-title">发布闲置物品</h1>
      <p class="form-sub">填几张卡的信息，让附近的邻居借走你的好物</p>

      <form class="publish-form" @submit.prevent="onSubmit">
        <!-- 分区一：物品信息 -->
        <fieldset class="form-section">
          <legend class="form-legend">① 物品信息</legend>

          <label class="field">
            <span class="field-label">物品名称 <i class="req">*</i></span>
            <input v-model="name" type="text" class="input" maxlength="50" placeholder="例如：九成新戴森吸尘器"
              required />
          </label>

          <label class="field">
            <span class="field-label">分类 <i class="req">*</i></span>
            <select v-model="category" class="select">
              <option v-for="c in PUBLISH_CATEGORIES" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">详细描述 <i class="req">*</i></span>
            <textarea v-model="desc" rows="3" class="textarea" maxlength="300"
              placeholder="描述物品的新旧程度、可借 / 可送等" required></textarea>
          </label>

          <div class="field">
            <span class="field-label">物品照片 <small>（选填，上传单张图片）</small></span>
            <div v-if="imgDataUri" class="img-uploaded">
              <img :src="imgDataUri" alt="图片预览" class="img-preview" />
              <button type="button" class="btn-img-remove" @click="clearImage">移除图片</button>
            </div>
            <div v-else class="photo-box" role="status">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                aria-hidden="true">
                <rect x="3" y="3" width="18" height="18"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span>小主没有上传图片哦</span>
            </div>
            <p v-if="imgError" class="img-error" role="alert">{{ imgError }}</p>
            <button type="button" class="btn-upload" :disabled="compressing" @click="fileInput?.click()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              {{ compressing ? '压缩中…' : imgDataUri ? '重新选择图片' : '上传图片' }}
            </button>
            <input ref="fileInput" type="file" accept="image/*" class="visually-hidden"
              @change="onPickImage" />
          </div>
        </fieldset>

        <!-- 分区二：定位与联系 -->
        <fieldset class="form-section">
          <legend class="form-legend">② 定位与联系</legend>

          <!-- 自动定位 -->
          <div class="field">
            <span class="field-label">我的位置 <small>（选填，自动获取，用于附近邻居按距离发现）</small></span>
            <div class="loc-box" role="status">
              <template v-if="locating">
                <span class="dot" aria-hidden="true"></span>
                正在获取定位…
              </template>
              <template v-else-if="locateState === 'ok'">
                <span class="ok" aria-hidden="true">✓</span>
                已获取定位（发布时将自动带上）
              </template>
              <template v-else-if="locateState === 'insecure'">
                <span class="fail" aria-hidden="true">!</span>
                当前为 HTTP 访问，浏览器禁用了定位——可跳过，不影响发布
              </template>
              <template v-else-if="locateState === 'denied'">
                <span class="fail" aria-hidden="true">!</span>
                定位权限被拒绝——请在浏览器设置中允许，或跳过
              </template>
              <template v-else>
                <span class="fail" aria-hidden="true">!</span>
                未获取到定位（可重试，或跳过——不影响发布）
              </template>
              <button v-if="locateState !== 'insecure'" type="button" class="btn-loc" :disabled="locating"
                @click="tryLocate">
                {{ locateState === 'ok' ? '重新定位' : '重试定位' }}
              </button>
            </div>
          </div>

          <!-- 联系方式：手机号 / 楼号 二选一 -->
          <div class="field">
            <span class="field-label">联系方式 <i class="req">*</i> <small>（楼号 或 手机号，二选一）</small></span>
            <div class="radio-group" role="radiogroup" aria-label="联系方式类型">
              <label class="radio-option" :class="{ active: contactType === 'building' }">
                <input v-model="contactType" type="radio" value="building" name="contactType" />
                楼号门牌
              </label>
              <label class="radio-option" :class="{ active: contactType === 'phone' }">
                <input v-model="contactType" type="radio" value="phone" name="contactType" />
                手机号
              </label>
            </div>
            <input v-model="contact" type="text" class="input" maxlength="40"
              :inputmode="contactType === 'phone' ? 'numeric' : 'text'"
              :placeholder="contactPlaceholder" />
            <p class="contact-hint">{{ contactType === 'phone' ? '邻居将通过手机号联系你' : '邻居将按楼号上门联系你' }}</p>
          </div>
        </fieldset>

        <fieldset class="form-section">
          <legend class="form-legend">租金</legend>
          <div class="radio-group" role="radiogroup" aria-label="租金计费方式">
            <label class="radio-option" :class="{ active: rentType === 'free' }">
              <input v-model="rentType" type="radio" value="free" name="rentType" />
              免费
            </label>
            <label class="radio-option" :class="{ active: rentType === 'daily' }">
              <input v-model="rentType" type="radio" value="daily" name="rentType" />
              元/天
            </label>
            <label class="radio-option" :class="{ active: rentType === 'perUse' }">
              <input v-model="rentType" type="radio" value="perUse" name="rentType" />
              元/次
            </label>
          </div>
          <div v-if="rentType !== 'free'" class="fee-row">
            <span class="prefix">¥</span>
            <input v-model="rentFee" type="number" min="0" step="0.01" class="input"
              :inputmode="'decimal'" :placeholder="rentType === 'daily' ? '如：2' : '如：5'" />
            <span class="suffix">{{ rentType === 'daily' ? '元 / 天' : '元 / 次' }}</span>
          </div>
          <p class="rent-hint">
            {{ rentType === 'free' ? '免费出借，最受邻居欢迎。' : rentType === 'daily' ? '按天计费：借期按天向上取整，不足 1 天按 1 天计算，归还时结算。' : '按次计费：每次借用固定费用，归还时结算。' }}
          </p>
        </fieldset>

        <button type="submit" class="btn-primary btn-submit" :disabled="publishing || store.writing">
          {{ publishing ? '发布中，请稍等…' : '发布闲置' }}
        </button>
        <p class="submit-hint">{{ publishing ? '正在同步到社区列表，通常只需几秒，请稍候…' : '提交后邻居即可看到。换设备用同一手机号登录即可管理。' }}</p>
      </form>
    </div>
  </main>
</template>

<style scoped>
.publish-main {
  padding-top: 0.75rem;
}

/* ── 表单外壳 ── */
.form-shell {
  position: relative;
  max-width: 760px;
  margin: 0 auto;
  background: var(--surface);
  border: var(--card-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius);
  padding: clamp(1.3rem, 3.5vw, 2.2rem);
}

.hero-tape {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 92px;
  height: 22px;
  background: var(--accent-3);
  opacity: 0.75;
  border: 1px solid var(--ink);
  z-index: 5;
}

.form-title {
  font-family: var(--font-head);
  font-size: 1.7rem;
  font-weight: 900;
  color: var(--ink);
  margin-bottom: 0.4rem;
}

.form-sub {
  color: var(--text-2);
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
}

.publish-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

/* ── 分区 ── */
.form-section {
  background: var(--fieldset-bg);
  border: var(--fieldset-border);
  border-radius: var(--radius);
  padding: 1.1rem 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-legend {
  float: left;
  margin: -1.5rem 0 0 -0.2rem;
  padding: 0.1rem 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--accent);
  color: var(--accent-ink);
}

/* ── 字段 ── */
.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
}

.field-label small {
  color: var(--text-3);
  font-weight: 400;
}

.req {
  color: var(--accent-2);
  font-style: normal;
}

/* ── 单选组 ── */
.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.radio-option {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 42px;
  padding: 0 1rem;
  font-size: 0.88rem;
  font-weight: 600;
  background: var(--chip-bg);
  color: var(--ink);
  border: var(--chip-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.radio-option input {
  accent-color: var(--accent);
}

.radio-option.active {
  background: var(--chip-active-bg);
  color: var(--chip-active-ink);
}

/* ── 照片 ── */
.photo-box {
  min-height: 150px;
  border: var(--border-dashed);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-3);
  font-size: 0.85rem;
  background: var(--photo-bg);
}

.photo-box svg {
  width: 28px;
  height: 28px;
}

.img-preview {
  width: min(280px, 100%);
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border: var(--border-thin);
  box-shadow: var(--shadow-soft);
  border-radius: var(--radius-sm);
}

.img-uploaded {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}

.img-error {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent-2);
}

.btn-upload {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 42px;
  padding: 0 1rem;
  font-size: 0.85rem;
  font-weight: 700;
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-ink);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
}

.btn-upload svg {
  width: 15px;
  height: 15px;
}

.btn-upload:disabled {
  cursor: wait;
  opacity: 0.6;
}

.btn-img-remove {
  min-height: 36px;
  padding: 0 0.8rem;
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--btn-secondary-bg);
  color: var(--accent-2);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
}

/* ── 定位 ── */
.loc-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding: 0.65rem 0.85rem;
  background: var(--input-bg);
  border: var(--input-border);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--text-2);
}

.loc-box .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
  animation: locPulse 0.9s ease-in-out infinite;
}

@keyframes locPulse {
  0%,
  100% {
    transform: scale(0.7);
    opacity: 0.6;
  }

  50% {
    transform: scale(1);
    opacity: 1;
  }
}

.loc-box .ok {
  color: var(--badge-avail-ink);
  font-weight: 700;
}

.loc-box .fail {
  color: var(--badge-arch-ink);
  font-weight: 700;
}

.btn-loc {
  margin-left: auto;
  min-height: 34px;
  padding: 0 0.8rem;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-ink);
  border: var(--border-thin);
  border-radius: var(--radius-sm);
}

.btn-loc:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 提示文字 ── */
.contact-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-3);
}

.rent-hint {
  font-size: 0.82rem;
  color: var(--text-3);
  margin: 0;
}

/* ── 租金金额行 ── */
.fee-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.fee-row .prefix {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--ink);
}

.fee-row .input {
  max-width: 160px;
}

.fee-row .suffix {
  font-size: 0.85rem;
  color: var(--text-2);
  font-family: var(--font-mono);
}

/* ── 提交 ── */
.btn-submit {
  width: 100%;
  min-height: 50px;
}

.submit-hint {
  font-size: 0.78rem;
  color: var(--text-3);
  text-align: center;
  margin: 0;
}

/* ================================================================
   主题差异化
   ================================================================ */
[data-theme="memphis"] .form-shell {
  transform: rotate(-0.35deg);
}

[data-theme="memphis"] .hero-tape {
  display: block;
}

[data-theme="brutalism"] .hero-tape,
[data-theme="editorial"] .hero-tape {
  display: none;
}

[data-theme="editorial"] .form-shell {
  border-radius: 14px;
  box-shadow: var(--shadow-1);
}

[data-theme="editorial"] .form-legend {
  background: var(--accent);
  border-radius: 4px;
}
</style>
