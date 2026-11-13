<!-- 一張卡片：平常顯示標題與說明，按「編輯」後直接在卡片上變成輸入框 -->
<template>
  <form v-if="editing" class="card editing" novalidate @submit.prevent="submit" @keydown.esc="cancel">
    <input
      ref="titleInput"
      v-model="title"
      class="field"
      type="text"
      maxlength="255"
      aria-label="標題"
    />
    <span v-if="errors.title" class="error">{{ errors.title[0] }}</span>
    <textarea v-model="description" class="field" aria-label="說明" placeholder="說明（選填）" />
    <span v-if="errors.description" class="error">{{ errors.description[0] }}</span>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="row">
      <button type="submit" class="btn" :disabled="saving">{{ saving ? '儲存中…' : '儲存' }}</button>
      <button type="button" class="btn ghost" :disabled="saving" @click="cancel">取消</button>
    </div>
  </form>

  <article v-else class="card">
    <h3>{{ card.title }}</h3>
    <p v-if="card.description">{{ card.description }}</p>
    <div class="card-actions">
      <button type="button" @click="startEdit">編輯</button>
      <button type="button" class="del" @click="emit('delete')">刪除</button>
    </div>
  </article>
</template>

<script setup>
import { nextTick, ref } from 'vue';

const props = defineProps({
  card: { type: Object, required: true },
  // 由看板頁提供：送出修改，失敗時丟出 ApiError
  save: { type: Function, required: true },
});
const emit = defineEmits(['delete']);

const editing = ref(false);
const saving = ref(false);
const title = ref('');
const description = ref('');
const errors = ref({});
const error = ref('');
const titleInput = ref(null);

async function startEdit() {
  title.value = props.card.title;
  description.value = props.card.description;
  errors.value = {};
  error.value = '';
  editing.value = true;
  await nextTick();
  titleInput.value?.focus();
}

function cancel() {
  editing.value = false;
}

async function submit() {
  if (!title.value.trim()) {
    errors.value = { title: ['請輸入標題'] };
    return;
  }
  errors.value = {};
  error.value = '';
  saving.value = true;
  try {
    await props.save({ title: title.value, description: description.value });
    editing.value = false;
  } catch (e) {
    errors.value = e.errors ?? {};
    if (Object.keys(errors.value).length === 0) error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: grab;
  min-width: 0;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.card:hover { box-shadow: var(--shadow); border-color: var(--line-strong); }
.card.editing { cursor: default; gap: 8px; box-shadow: var(--shadow); }
h3 { margin: 0; font-size: 15px; font-weight: 500; color: var(--heading); overflow-wrap: anywhere; }
p { margin: 0; font-size: 13px; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.card-actions { display: flex; gap: 14px; margin-top: 6px; font-size: 13px; }
.card-actions button { border: 0; background: none; padding: 0; color: var(--link); }
.card-actions button:hover { text-decoration: underline; }
.card-actions .del { color: var(--faint); }
.card-actions .del:hover { color: var(--danger); }
</style>
