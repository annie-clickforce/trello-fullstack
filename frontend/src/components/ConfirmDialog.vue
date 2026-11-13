<!-- 確認視窗：按「取消」、點視窗外面或按 Esc 都會關閉 -->
<template>
  <div class="backdrop" @click.self="emit('cancel')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">{{ title }}</h2>
      <p>{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="row actions">
        <button ref="cancelButton" type="button" class="btn ghost" :disabled="busy" @click="emit('cancel')">取消</button>
        <button type="button" class="btn danger" :disabled="busy" @click="emit('confirm')">{{ busy ? '處理中…' : confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '確定' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['confirm', 'cancel']);

const cancelButton = ref(null);
const onKeydown = (event) => {
  if (event.key === 'Escape') emit('cancel');
};
onMounted(() => {
  cancelButton.value?.focus();
  document.addEventListener('keydown', onKeydown);
});
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 20;
}
.dialog {
  background: var(--surface);
  color: var(--fg);
  border-radius: 10px;
  padding: 22px 22px 18px;
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}
h2 { margin: 0; font-size: 17px; }
p { margin: 0; color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
.actions { justify-content: flex-end; margin-top: 8px; }
</style>
