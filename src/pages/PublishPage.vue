<script setup lang="ts">
// ================================================
// PublishPage — 发布闲置：物品信息（含分类）+ 位置与联系
// 写路径：拼预填 GitHub Issue 创建链接（方案1，零凭证）
// ================================================

import { ref } from 'vue'
import { getLocation } from '@/composables/useGeolocation'
import { useToast } from '@/composables/useToast'
import { buildPublishUrl } from '@/lib/api'
import { PUBLISH_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/types'

const toast = useToast()

const name = ref('')
const desc = ref('')
const contact = ref('')
const building = ref('')
const imgUrl = ref('')
const category = ref<CategoryId>('other')

const lat = ref<number | null>(null)
const lng = ref<number | null>(null)
const locating = ref(false)
const locateStatus = ref<'none' | 'ok' | 'addr' | 'fail'>('none')
const addrText = ref('')

async function doLocate(): Promise<void> {
  if (locating.value) return
  locating.value = true
  try {
    const pos = await getLocation()
    lat.value = pos.lat
    lng.value = pos.lng
    locateStatus.value = 'ok'
    addrText.value = '正在获取地址…'
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&accept-language=zh`,
      )
      const data = (await res.json()) as { display_name?: string }
      const parts = (data.display_name ?? '').split(',').map((s) => s.trim())
      addrText.value = parts.slice(0, 3).join(', ') || `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`
      locateStatus.value = 'addr'
    } catch {
      addrText.value = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`
      locateStatus.value = 'addr'
    }
  } catch {
    locateStatus.value = 'fail'
    toast.warning('定位失败', '请允许浏览器定位权限后重试')
  } finally {
    locating.value = false
  }
}

// 图片链接即时预览
const imgPreviewOk = ref(false)
function onImgInput(): void {
  const v = imgUrl.value.trim()
  imgPreviewOk.value = /^https?:\/\//i.test(v) || v.startsWith('data:image/')
}

function onSubmit(): void {
  if (!name.value.trim() || !desc.value.trim()) {
    toast.warning('请填写完整', '物品名称和描述为必填项')
    return
  }
  if (!contact.value.trim() && !building.value.trim()) {
    toast.warning('请填写联系方式', '楼号与联系方式至少填写一项')
    return
  }
  if (lat.value == null || lng.value == null) {
    toast.warning('请先定位', '点击「获取位置」完成定位')
    return
  }

  const url = buildPublishUrl({
    name: name.value.trim(),
    desc: desc.value.trim(),
    contact: contact.value.trim(),
    building: building.value.trim(),
    lat: lat.value,
    lng: lng.value,
    imgUrl: imgUrl.value.trim(),
    category: category.value,
  })

  const win = window.open(url, '_blank', 'noopener')
  if (!win) {
    navigator.clipboard
      ?.writeText(url)
      .then(() => toast.warning('跳转被拦截', '发布链接已复制，请粘贴到浏览器打开', 6000))
      .catch(() => toast.warning('跳转被拦截', '请允许弹出窗口后重试', 6000))
    return
  }
  toast.success('已在 GitHub 打开发布页', '登录后点 Submit 即上架，本站自动同步展示', 6000)
}
</script>

<template>
  <main class="memphis-container publish-main">
    <div class="form-collage">
      <span class="hero-tape" aria-hidden="true"></span>
      <h1 class="form-title">发布闲置物品</h1>
      <p class="form-sub">填几张卡的信息，让邻居借走你的好物</p>

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

          <label class="field">
            <span class="field-label">物品照片链接 <small>（选填）</small></span>
            <input v-model="imgUrl" type="url" class="memphis-input" inputmode="url"
              placeholder="粘贴图片链接，例如图床 / 相册分享链接" @input="onImgInput" />
            <img v-if="imgPreviewOk" :src="imgUrl" alt="图片预览" class="img-preview"
              @error="imgPreviewOk = false" />
          </label>
        </fieldset>

        <!-- 分区二：位置与联系 -->
        <fieldset class="form-section sec-blue">
          <legend>② 位置与联系</legend>

          <div class="field">
            <span class="field-label">您的位置 <i class="req">*</i></span>
            <button type="button" class="btn-locate" :class="{ ok: locateStatus === 'ok' || locateStatus === 'addr' }"
              :disabled="locating" @click="doLocate">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                aria-hidden="true">
                <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z"></path>
                <circle cx="12" cy="10" r="2.5"></circle>
              </svg>
              {{ locating ? '定位中…' : locateStatus === 'ok' || locateStatus === 'addr' ? '已定位' : '点击获取位置' }}
            </button>
            <p v-if="addrText" class="addr-text">{{ addrText }}</p>
          </div>

          <label class="field">
            <span class="field-label">楼号门牌 <small>（与联系方式二选一）</small></span>
            <input v-model="building" type="text" class="memphis-input" placeholder="例如：3 栋 2 单元 1801" />
          </label>

          <label class="field">
            <span class="field-label">联系方式 <small>（微信 / 手机号）</small></span>
            <input v-model="contact" type="text" class="memphis-input" placeholder="例如：微信 xxx 或手机号" />
          </label>
        </fieldset>

        <button type="submit" class="btn-memphis-primary btn-submit">发布物品</button>
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

.btn-locate {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 48px;
  padding: 0.6rem 1rem;
  border: 2.5px dashed var(--ink);
  background: var(--bg-cream);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 700;
  transition:
    transform 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    background var(--ease-snap),
    border-style var(--ease-snap);
}

.btn-locate:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--royal-blue);
}

.btn-locate.ok {
  border-style: solid;
  background: var(--mustard);
}

.addr-text {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #555;
}

.btn-submit {
  width: 100%;
}
</style>
