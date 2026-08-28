<script setup lang="ts">
// 借阅弹窗：展示物主联系方式（手机号/楼号二选一）→ 确认借用后状态变「已借出」
// 未登录时内嵌手机号登录表单
import { computed } from 'vue'
import BaseModal from './BaseModal.vue'
import LoginBox from './LoginBox.vue'
import type { Item } from '@/lib/types'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { canBorrow, canReturn, isOwner } from '@/lib/itemOps'
import { contactRows } from '@/lib/contact'

const props = defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()

const store = useItemsStore()
const auth = useAuthStore()

const needLogin = computed(() => !auth.isLoggedIn)
const ownerIsMe = computed(() => (props.item ? isOwner(props.item, auth.phone) : false))
const borrowable = computed(() =>
  props.item ? canBorrow(props.item, auth.phone) : false,
)
const mineLent = computed(() =>
  props.item ? canReturn(props.item, auth.phone) : false,
)

/** 联系方式行：楼牌号在前、手机号在后 */
const contactRowsList = computed(() => (props.item ? contactRows(props.item) : []))

function onConfirmBorrow(): void {
  if (props.item && store.borrow(props.item.id)) emit('close')
}

function onReturn(): void {
  if (props.item && store.returnBack(props.item.id)) emit('close')
}</script>

<template>
  <BaseModal :open="open" labelled-by="borrow-title" @close="emit('close')">
    <div v-if="item" class="modal-inner">
      <div class="modal-head">
        <span class="head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M4 11 12 4l8 7"></path>
            <path d="M6 10v9h12v-9"></path>
          </svg>
        </span>
        <div>
          <h3 id="borrow-title" class="head-title">借用「{{ item.name }}」</h3>
          <div class="head-sub">{{ item.status === 'lent' ? '当前状态：已借出' : '当前状态：可借' }}</div>
        </div>
      </div>

      <!-- ① 未登录：先登录（登录后自动切换到确认借用视图） -->
      <LoginBox v-if="needLogin" />

      <!-- ② 物主本人 -->
      <template v-else-if="ownerIsMe">
        <p class="owner-tip">这是你自己发布的物品。邻居借用后，这里会展示借用与归还进度。</p>
      </template>

      <!-- ③ 已借出 -->
      <template v-else-if="item.status === 'lent'">
        <p v-if="mineLent" class="lent-tip">你已借走这件物品，用完记得归还哦。</p>
        <p v-else class="lent-tip">这件物品已被邻居借走，晚点再来看看吧。</p>
        <button v-if="mineLent" type="button" class="btn-memphis-primary btn-block" @click="onReturn">
          我要归还
        </button>
      </template>

      <!-- ④ 可借：展示联系方式 + 评论命令借阅 -->
      <template v-else>
        <div class="contact-card">
          <div v-for="row in contactRowsList" :key="row.label" class="contact-row">
            <span class="k">{{ row.label }}</span>
            <b class="v selectable">{{ row.value }}</b>
          </div>
          <div v-if="contactRowsList.length === 0" class="contact-row">
            <span class="k">联系方式</span>
            <b class="v">未填写</b>
          </div>
        </div>

        <p class="privacy-tip">点击下方按钮会打开该物品的 GitHub 评论区，命令已自动复制，粘贴发送即可借出（全站实时可见）。</p>

        <button
          type="button"
          class="btn-memphis-primary btn-block"
          :disabled="!borrowable"
          @click="onConfirmBorrow"
        >
          去 GitHub 借阅
        </button>
      </template>
    </div>
  </BaseModal>
</template>

<style scoped>
.modal-inner {
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.head-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  background: var(--mustard);
  border: 2.5px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.head-title {
  font-family: var(--font-serif);
  font-size: 1.2rem;
  text-wrap: balance;
}

.head-sub {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: #777;
}

.contact-card {
  border: 2px solid var(--ink);
  background: var(--bg-cream);
  box-shadow: 3px 3px 0 var(--ink);
  display: flex;
  flex-direction: column;
}

.contact-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.7rem 0.9rem;
}

.contact-row .k {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: #777;
}

.contact-row .v {
  font-size: 0.92rem;
  color: var(--ink);
}

/* 联系方式保持可选中，供长按手动复制 */
.selectable {
  -webkit-user-select: text;
  user-select: text;
}

.owner-tip,
.lent-tip {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.7;
  color: #555;
}

.btn-block {
  width: 100%;
}

.privacy-tip {
  font-size: 0.75rem;
  color: #999;
  text-align: center;
  margin: 0;
}
</style>
