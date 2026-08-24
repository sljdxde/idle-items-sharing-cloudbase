<script setup lang="ts">
// Toast 渲染层（数据在 useToast 单例里）
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-wrap" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">
          <button type="button" class="t-close" aria-label="关闭提示" @click="dismiss(t.id)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
              aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18"></path>
            </svg>
          </button>
          <div class="t-body">
            <div class="t-title">{{ t.title }}</div>
            <div v-if="t.msg" class="t-msg">{{ t.msg }}</div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-wrap {
  position: fixed;
  top: 14px;
  right: 14px;
  left: 14px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
  z-index: 1200;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  width: min(360px, 100%);
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.75rem 0.85rem;
  background: var(--paper-cream);
  border: 2.5px solid var(--ink);
  box-shadow: 4px 4px 0 var(--ink);
}

.toast.success {
  box-shadow: 4px 4px 0 var(--olive);
}

.toast.error {
  box-shadow: 4px 4px 0 var(--retro-red);
}

.toast.warning {
  box-shadow: 4px 4px 0 var(--salmon);
}

.toast.info {
  box-shadow: 4px 4px 0 var(--royal-blue);
}

.t-close {
  order: 2;
  flex: none;
  margin-left: auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--ink);
  background: var(--paper-cream);
  color: var(--ink);
  transition: background var(--ease-snap);
}

.t-close:hover {
  background: var(--mustard);
}

.t-body {
  flex: 1;
  min-width: 0;
}

.t-title {
  font-family: var(--font-mono);
  font-size: 0.88rem;
  font-weight: 700;
}

.t-msg {
  font-size: 0.82rem;
  color: #555;
  line-height: 1.55;
}

.toast-enter-active {
  transition:
    transform 0.3s var(--ease),
    opacity 0.3s var(--ease);
}

.toast-leave-active {
  transition:
    transform 0.2s ease-in,
    opacity 0.2s ease-in;
}

.toast-enter-from {
  transform: translateY(-16px) rotate(1deg);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(24px);
  opacity: 0;
}
</style>
