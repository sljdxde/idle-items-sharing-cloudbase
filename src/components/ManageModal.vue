<script setup lang="ts">
// 物主管理弹窗：状态总览 + 借阅人信息 + 上架/下架（全本地操作）
import { computed } from 'vue'
import BaseModal from './BaseModal.vue'
import type { Item } from '@/lib/types'
import { useItemsStore } from '@/stores/items'
import { useAuthStore } from '@/stores/auth'
import { isOwner } from '@/lib/itemOps'

const props = defineProps<{
  open: boolean
  item: Item | null
}>()

const emit = defineEmits<{ close: [] }>()

const store = useItemsStore()
const auth = useAuthStore()

const ownerIsMe = computed(() => (props.item ? isOwner(props.item, auth.phone) : false))

const statusText = computed(() => {
  const it = props.item
  if (!it) return ''
  if (it.archived) return '已下架'
  return it.status === 'lent' ? '已借出' : '可借'
})

const borrowerMasked = computed(() => {
  const p = props.item?.borrowedBy
  return p ? p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''
})

function onToggleArchive(): void {
  if (props.item && store.setArchived(props.item.id, !props.item.archived)) {
    emit('close')
  }
}
</script>

<template>
  <BaseModal :open="open" labelled-by="manage-title" @close="emit('close')">
    <div v-if="item" class="modal-inner">
      <div class="modal-head">
        <span class="head-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z"></path>
            <path d="M9.5 12l1.8 1.8L15 10"></path>
          </svg>
        </span>
        <div>
          <h3 id="manage-title" class="head-title">物品管理</h3>
          <div class="head-sub">{{ item.name }} · 当前：{{ statusText }}</div>
        </div>
      </div>

      <!-- 非物主：无权管理 -->
      <p v-if="!ownerIsMe" class="deny-tip">只有发布者可以管理这件物品。</p>

      <!-- 物主面板 -->
      <template v-else>
        <div class="info-card">
          <div class="info-row">
            <span class="k">当前状态</span>
            <b class="v">{{ statusText }}</b>
          </div>
          <div v-if="item.borrowedBy" class="info-row">
            <span class="k">借阅人手机号</span>
            <b class="v selectable">{{ borrowerMasked }}</b>
          </div>
          <div class="info-row">
            <span class="k">联系方式</span>
            <b class="v selectable">{{ item.contactType === 'phone' ? '手机号' : '楼号' }} · {{ item.contact }}</b>
          </div>
        </div>

        <ul class="guide-list">
          <li>下架后物品从公共列表隐藏（不影响已发生的借用）</li>
          <li>重新上架即可恢复展示</li>
          <li>物品被借用时状态自动变为「已借出」，归还后自动恢复「可借」</li>
        </ul>

        <button type="button" class="btn-memphis-primary btn-block" @click="onToggleArchive">
          {{ item.archived ? '重新上架' : '下架物品' }}
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
  background: var(--salmon);
  border: 2.5px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}

.head-title {
  font-family: var(--font-serif);
  font-size: 1.3rem;
}

.head-sub {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: #555;
}

.deny-tip {
  margin: 0;
  font-size: 0.9rem;
  color: #777;
}

.info-card {
  border: 2px solid var(--ink);
  background: var(--bg-cream);
  box-shadow: 3px 3px 0 var(--ink);
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  padding: 0.7rem 0.9rem;
}

.info-row + .info-row {
  border-top: 1.5px dashed rgba(29, 30, 44, 0.25);
}

.info-row .k {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: #777;
}

.info-row .v {
  font-size: 0.92rem;
  color: var(--ink);
}

.selectable {
  -webkit-user-select: text;
  user-select: text;
}

.guide-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.guide-list li {
  font-size: 0.88rem;
  line-height: 1.6;
  color: #333;
  border-left: 3px solid var(--mustard);
  padding-left: 0.6rem;
}

.btn-block {
  width: 100%;
}
</style>
