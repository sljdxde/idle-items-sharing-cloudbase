<script setup lang="ts">
// ================================================
// PublishPage — 发布闲置：自动获取定位 + 联系方式（手机号/楼号 二选一）
// 未登录先展示登录卡；发布数据（含定位）保存到本地
// ================================================

import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useItemsStore, type PublishDraft } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { PUBLISH_CATEGORIES } from '@/lib/categories'
import type { CategoryId, ContactType } from '@/lib/types'
import { isValidPhone } from '@/lib/validate'
import LoginBox from '@/components/LoginBox.vue'

const router = useRouter()
const store = useItemsStore()
const auth = useAuthStore()

const name = ref('')
const desc = ref('')
const imgUrl = ref('')
const category = ref<CategoryId>('other')
const publishing = ref(false)

// 联系方式：手机号 / 楼号 二选一
const contactType = ref<ContactType>('phone')
const contact = ref('')

// 定位状态
const locating = ref(false)
const locateState = ref<'idle' | 'ok' | 'fail'>('idle')

const contactLabel = computed(() => (contactType.value === 'phone' ? '手机号' : '楼号门牌'))
const contactPlaceholder = computed(() =>
  contactType.value === 'phone' ? '例如：13812345678' : '例如：3 栋 2 单元 1801',
)

onMounted(() => {
  void tryLocate()
})

async function tryLocate(): Promise<void> {
  locating.value = true
  const ok = await store.locate()
  locating.value = false
  locateState.value = ok ? 'ok' : 'fail'
}

function validateContact(): boolean {
  const v = contact.value.trim()
  if (!v) {
    window.alert(`请填写${contactLabel.value}（联系方式必填）`)
    return false
  }
  if (contactType.value === 'phone' && !isValidPhone(v)) {
    window.alert('手机号格式不正确（1 开头 11 位数字）')
    return false
  }
  return true
}

function onSubmit(): void {
  if (publishing.value) return
  if (!name.value.trim() || !desc.value.trim()) {
    window.alert('请填写物品名称和描述')
    return
  }
  if (!validateContact()) return

  publishing.value = true
  try {
    const draft: PublishDraft = {
      name: name.value,
      desc: desc.value,
      contactType: contactType.value,
      contact: contact.value,
      imgUrl: imgUrl.value,
      category: category.value,
      position: store.userPosition,
    }
    if (store.publish(draft)) {
      router.push('/')
    }
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <main class="memphis-container publish-main">
    <!-- ① 未登录：先登录 -->
    <div v-if="!auth.isLoggedIn" class="form-collage">
      <span class="hero-tape" aria-hidden="true"></span>
      <h1 class="form-title">发布闲置物品</h1>
      <p class="form-sub">发布需要先登录——用你的手机号，邻居们也能借此联系你</p>
      <LoginBox />
    </div>

    <!-- ② 已登录：发布表单 -->
    <div v-else class="form-collage">
      <span class="hero-tape" aria-hidden="true"></span>
      <h1 class="form-title">发布闲置物品</h1>
      <p class="form-sub">填几张卡的信息，让附近的邻居借走你的好物</p>

      <form class="publish-form" @submit.prevent="onSubmit">
        <!-- 分区一：物品信息 -->
        <fieldset class="form-section sec-red">
          <legend>① 物品信息</legend>

          <label class="field">
            <span class="field-label">物品名称 <i class="req">*</i></span>
            <input v-model="name" type="text" class="memphis-input" maxlength="50" placeholder="例如：九成新戴森吸尘器"
              required />
          </label>

          <label class="field">
            <span class="field-label">分类 <i class="req">*</i></span>
            <select v-model="category" class="memphis-select">
              <option v-for="c in PUBLISH_CATEGORIES" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">详细描述 <i class="req">*</i></span>
            <textarea v-model="desc" rows="3" class="memphis-textarea"
              placeholder="描述物品的新旧程度、可借 / 可送等" required></textarea>
          </label>

          <div class="field">
            <span class="field-label">物品照片链接 <small>（选填，外链图片地址）</small></span>
            <input v-model="imgUrl" type="url" class="memphis-input" maxlength="500"
              placeholder="粘贴图片链接，例如图床 / 相册分享链接" />
            <img v-if="imgUrl" :src="imgUrl" alt="图片预览" class="img-preview" />
          </div>
        </fieldset>

        <!-- 分区二：定位与联系 -->
        <fieldset class="form-section sec-blue">
          <legend>② 定位与联系</legend>

          <!-- 自动定位 -->
          <div class="field">
            <span class="field-label">我的位置 <small>（自动获取，用于附近邻居按距离发现）</small></span>
            <div class="loc-box" role="status">
              <template v-if="locating">
                <span class="loc-dot" aria-hidden="true"></span>
                正在获取定位…
              </template>
              <template v-else-if="locateState === 'ok'">
                <span class="loc-ok" aria-hidden="true">✓</span>
                已获取定位（发布时将自动带上）
              </template>
              <template v-else>
                <span class="loc-fail" aria-hidden="true">!</span>
                未获取到定位（可重试，或跳过——不影响发布）
              </template>
              <button type="button" class="btn-loc-retry" :disabled="locating" @click="tryLocate">
                {{ locateState === 'ok' ? '重新定位' : '重试定位' }}
              </button>
            </div>
          </div>

          <!-- 联系方式：手机号 / 楼号 二选一 -->
          <div class="field">
            <span class="field-label">联系方式 <i class="req">*</i> <small>（手机号 或 楼号，二选一）</small></span>
            <div class="contact-type-group" role="radiogroup" aria-label="联系方式类型">
              <label class="contact-type-option" :class="{ active: contactType === 'phone' }">
                <input v-model="contactType" type="radio" value="phone" name="contactType" />
                手机号
              </label>
              <label class="contact-type-option" :class="{ active: contactType === 'building' }">
                <input v-model="contactType" type="radio" value="building" name="contactType" />
                楼号门牌
              </label>
            </div>
            <input v-model="contact" type="text" class="memphis-input" maxlength="40"
              :inputmode="contactType === 'phone' ? 'numeric' : 'text'"
              :placeholder="contactPlaceholder" />
            <p class="contact-hint">{{ contactType === 'phone' ? '邻居将通过手机号联系你' : '邻居将按楼号上门联系你' }}</p>
          </div>
        </fieldset>

        <button type="submit" class="btn-memphis-primary btn-submit" :disabled="publishing">
          {{ publishing ? '发布中…' : '发布物品' }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.publish-main {
  padding-top: 0.75rem;
}

.form-collage {
  position: relative;
  max-width: 720px;
  margin: 0 auto;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 8px 8px 0 var(--retro-purple);
  padding: clamp(1.4rem, 3.5vw, 2.2rem);
  transform: rotate(-0.35deg);
}

.hero-tape {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 92px;
  height: 22px;
  background: rgba(233, 196, 106, 0.75);
  border: 1px solid var(--ink);
  z-index: 5;
}

.form-title {
  font-family: var(--font-serif);
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  text-wrap: balance;
}

.form-sub {
  color: #666;
  font-size: 0.92rem;
  margin: 0.4rem 0 1.6rem;
}

.publish-form {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.form-section {
  border: 2.5px solid var(--ink);
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-section legend {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.25rem 0.7rem;
  border: 2px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.sec-red legend {
  background: var(--salmon);
}

.sec-blue legend {
  background: var(--mustard);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.field-label {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
}

.field-label small {
  color: #888;
  font-weight: 400;
}

.req {
  color: var(--retro-red);
  font-style: normal;
}

.img-preview {
  width: min(280px, 100%);
  aspect-ratio: 4/3;
  object-fit: cover;
  border: 2.5px solid var(--ink);
  box-shadow: 4px 4px 0 var(--mustard);
  transform: rotate(0.6deg);
}

.btn-submit {
  width: 100%;
}

/* ── 定位状态盒 ── */
.loc-box {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 48px;
  padding: 0.55rem 0.8rem;
  border: 2px dashed var(--ink);
  background: var(--bg-cream);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
  color: #555;
}

.loc-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--retro-red);
  border: 2px solid var(--ink);
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

.loc-ok {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  background: var(--olive);
  color: #fff;
  border: 2px solid var(--ink);
  font-size: 0.72rem;
}

.loc-fail {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  background: var(--mustard);
  color: var(--ink);
  border: 2px solid var(--ink);
  font-size: 0.72rem;
  font-weight: 700;
}

.btn-loc-retry {
  margin-left: auto;
  min-height: 36px;
  padding: 0 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  background: var(--paper-cream);
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  transition:
    transform 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    background var(--ease-snap);
}

.btn-loc-retry:hover:not(:disabled) {
  background: var(--mustard);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ink);
}

.btn-loc-retry:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 联系方式类型 radio ── */
.contact-type-group {
  display: flex;
  gap: 0.6rem;
}

.contact-type-option {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 44px;
  border: 2px solid var(--ink);
  background: var(--paper-cream);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--ease-snap),
    color var(--ease-snap),
    box-shadow 0.15s var(--ease),
    transform 0.15s var(--ease);
}

.contact-type-option:hover {
  box-shadow: 3px 3px 0 var(--ink);
  transform: translate(-1px, -1px);
}

.contact-type-option.active {
  background: var(--ink);
  color: var(--mustard);
  box-shadow: none;
  transform: translate(1px, 1px);
}

.contact-type-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.contact-hint {
  margin: 0;
  font-size: 0.75rem;
  color: #999;
}
</style>
