<script setup lang="ts">
// ================================================
// PublishPage — 发布闲置：站内直发（本地存储），图片本机压缩后内嵌
// 离线容器：无定位/无外链图床，位置=楼号门牌
// ================================================

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useItemsStore } from '@/stores/items'
import { useToast } from '@/composables/useToast'
import { PUBLISH_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/types'

const toast = useToast()
const router = useRouter()
const store = useItemsStore()

const name = ref('')
const desc = ref('')
const contact = ref('')
const building = ref('')
const imgUrl = ref('')
const category = ref<CategoryId>('other')
const publishing = ref(false)

/** 选图 → canvas 压缩为 data:URI（包内可用，离线可见） */
const fileInput = ref<HTMLInputElement | null>(null)
function pickImage(): void {
  fileInput.value?.click()
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.warning('仅支持图片', '请选择照片文件')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1000
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
      if (dataUrl.length > 1_500_000) {
        toast.warning('图片过大', '换一张小一点的照片试试')
        return
      }
      imgUrl.value = dataUrl
    }
    img.onerror = () => toast.warning('图片读取失败', '换一张试试')
    img.src = String(reader.result)
  }
  reader.readAsDataURL(file)
  input.value = '' // 允许重复选择同一张
}

function clearImage(): void {
  imgUrl.value = ''
}

async function onSubmit(): Promise<void> {
  if (publishing.value) return
  if (!name.value.trim() || !desc.value.trim()) {
    toast.warning('请填写完整', '物品名称和描述为必填项')
    return
  }
  if (!contact.value.trim() && !building.value.trim()) {
    toast.warning('请填写联系方式', '楼号与联系方式至少填写一项')
    return
  }

  publishing.value = true
  try {
    store.publish({
      name: name.value,
      desc: desc.value,
      contact: contact.value,
      building: building.value,
      imgUrl: imgUrl.value,
      category: category.value,
    })
    toast.success('发布成功', '物品已上架，邻居们可以看到啦')
    router.push('/')
  } finally {
    publishing.value = false
  }
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

          <div class="field">
            <span class="field-label">物品照片 <small>（选填，自动压缩保存在本机）</small></span>
            <input ref="fileInput" type="file" accept="image/*" class="visually-hidden" @change="onFileChange" />
            <img v-if="imgUrl" :src="imgUrl" alt="图片预览" class="img-preview" />
            <button v-if="imgUrl" type="button" class="btn-ghost btn-sm" @click="clearImage">移除照片</button>
            <button v-else type="button" class="btn-photo" @click="pickImage">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                aria-hidden="true">
                <rect x="3" y="3" width="18" height="18"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              从相册选择照片
            </button>
          </div>
        </fieldset>

        <!-- 分区二：位置与联系 -->
        <fieldset class="form-section sec-blue">
          <legend>② 位置与联系</legend>

          <label class="field">
            <span class="field-label">楼号门牌 <small>（与联系方式二选一）</small></span>
            <input v-model="building" type="text" class="memphis-input" maxlength="30"
              placeholder="例如：3 栋 2 单元 1801" />
          </label>

          <label class="field">
            <span class="field-label">联系方式 <small>（微信 / 手机号）</small></span>
            <input v-model="contact" type="text" class="memphis-input" maxlength="40"
              placeholder="例如：微信 xxx 或手机号" />
          </label>
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

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.btn-photo {
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

.btn-photo:hover {
  transform: translate(-2px, -2px);
  box-shadow: 4px 4px 0 var(--royal-blue);
}

.img-preview {
  width: min(280px, 100%);
  aspect-ratio: 4/3;
  object-fit: cover;
  border: 2.5px solid var(--ink);
  box-shadow: 4px 4px 0 var(--mustard);
  transform: rotate(0.6deg);
}

.btn-sm {
  align-self: flex-start;
  padding: 0.45rem 0.8rem;
  font-size: 0.8rem;
  box-shadow: 2px 2px 0 var(--ink);
}

.btn-submit {
  width: 100%;
}
</style>
