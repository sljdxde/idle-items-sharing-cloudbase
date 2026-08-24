<script setup lang="ts">
// ================================================
// BaseModal — Teleport 模态原语：遮罩点击/Esc 关闭 + 弹入过渡
// ================================================

import { onBeforeUnmount, onMounted } from 'vue'

const props = defineProps<{
  open: boolean
  labelledBy?: string
}>()

const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="open" class="modal-overlay" @click.self="emit('close')">
        <Transition name="modal-pop" appear>
          <div v-if="open" class="modal-panel" role="dialog" aria-modal="true" :aria-labelledby="labelledBy">
            <slot />
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(29, 30, 44, 0.55);
}

@media (max-width: 640px) {
  .modal-overlay {
    align-items: flex-end;
    padding: 0;
  }
}

.modal-panel {
  width: 100%;
  max-width: 480px;
  max-height: min(86vh, 720px);
  overflow-y: auto;
  background: var(--paper-cream);
  border: 3px solid var(--ink);
  box-shadow: 8px 8px 0 var(--retro-purple);
}

@media (max-width: 640px) {
  .modal-panel {
    max-width: none;
    border-left: none;
    border-right: none;
    border-bottom: none;
    box-shadow: 0 -6px 0 rgba(114, 9, 183, 0.35);
    border-radius: 20px 20px 0 0;
  }
}
</style>
