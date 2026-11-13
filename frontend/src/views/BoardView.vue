<!-- 看板頁：上方新增表單，下面待辦／進行中／完成三欄，卡片可拖拉 -->
<template>
  <header class="site-header">
    <div class="header-inner">
      <div class="brand">我的看板</div>
      <div class="user">
        <span>{{ currentUser?.name }}</span>
        <button type="button" class="btn ghost logout" @click="doLogout">登出</button>
      </div>
    </div>
  </header>

  <div class="page">
    <section v-if="!loading" class="summary" aria-label="進度摘要">
      <div class="summary-text">
        <p class="greeting">{{ greeting }}</p>
        <p class="detail">{{ detail }}</p>
      </div>
      <div v-if="total > 0" class="progress">
        <div class="progress-label">完成 <strong>{{ columns.done.length }}</strong> / {{ total }}</div>
        <div class="progress-bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" :style="{ width: percent + '%' }" />
        </div>
      </div>
    </section>

    <form class="top-add" novalidate @submit.prevent="addCard">
      <label class="top-field">
        標題
        <input id="new-title" v-model="newCard.title" class="field" type="text" maxlength="255" placeholder="要做什麼？" />
      </label>
      <label class="top-field">
        說明
        <input id="new-desc" v-model="newCard.description" class="field" type="text" placeholder="選填" />
      </label>
      <button class="btn" type="submit" :disabled="adding">{{ adding ? '新增中…' : '新增' }}</button>
    </form>
    <p v-if="addError" class="error add-error">{{ addError }}</p>

    <p v-if="boardError" class="error banner" role="alert">{{ boardError }}</p>
    <p v-if="loading" class="muted">載入中…</p>

    <div v-else class="board">
      <section v-for="col in COLUMNS" :key="col.key" class="column" :aria-label="col.name">
        <div class="column-head">
          <h2>{{ col.name }}</h2>
          <span class="count">{{ columns[col.key].length }}</span>
        </div>
        <draggable
          v-model="columns[col.key]"
          item-key="id"
          group="cards"
          class="cards"
          draggable=".card"
          ghost-class="drag-ghost"
          :animation="150"
          filter="input, textarea, button, .editing"
          :prevent-on-filter="false"
          :data-status="col.key"
          @change="onDragChange(col.key, $event)"
        >
          <template #item="{ element }">
            <CardItem :card="element" :save="(fields) => saveCard(element, fields)" @delete="askDelete(col.key, element)" />
          </template>
          <template #footer>
            <EmptyColumn v-if="columns[col.key].length === 0" :status="col.key" />
          </template>
        </draggable>
      </section>
    </div>

    <ConfirmDialog
      v-if="pendingDelete"
      title="刪除這張卡片？"
      :message="`「${pendingDelete.card.title}」刪除後無法復原。`"
      confirm-text="刪除"
      :busy="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
      @cancel="closeDelete"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';
import CardItem from '../components/CardItem.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import EmptyColumn from '../components/EmptyColumn.vue';
import { apiFetch } from '../api.js';
import { currentUser, logout } from '../auth.js';

const COLUMNS = [
  { key: 'todo', name: '待辦' },
  { key: 'doing', name: '進行中' },
  { key: 'done', name: '完成' },
];

const router = useRouter();
const columns = reactive({ todo: [], doing: [], done: [] });
const loading = ref(true);
const boardError = ref('');

async function loadCards() {
  const data = await apiFetch('/cards');
  for (const { key } of COLUMNS) columns[key] = data[key];
}

onMounted(async () => {
  try {
    await loadCards();
  } catch (e) {
    boardError.value = e.message;
  } finally {
    loading.value = false;
  }
});

// ---- 進度摘要（從目前的卡片計算） ----
const total = computed(() => COLUMNS.reduce((n, { key }) => n + columns[key].length, 0));
const percent = computed(() => (total.value ? Math.round((columns.done.length / total.value) * 100) : 0));
const greeting = computed(() => `${currentUser.value?.name ?? ''}，${timeOfDay()}`);
const detail = computed(() => {
  if (total.value === 0) return '看板還是空的，從新增第一張卡片開始吧。';
  if (columns.todo.length === 0 && columns.doing.length === 0) return '所有卡片都完成了，做得好！';
  return `你有 ${columns.todo.length} 件待辦、${columns.doing.length} 件進行中。`;
});

function timeOfDay() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早安';
  if (hour < 18) return '午安';
  return '晚安';
}

// 操作失敗時：重新載入，讓畫面回到伺服器上的真實狀態
async function reloadAfterError(e) {
  boardError.value = `${e.message}（已重新載入看板）`;
  try {
    await loadCards();
  } catch {
    // 重新載入也失敗時，保留上面的錯誤訊息
  }
}

// ---- 新增 ----
const newCard = reactive({ title: '', description: '' });
const adding = ref(false);
const addError = ref('');

async function addCard() {
  if (!newCard.title.trim()) {
    addError.value = '請輸入標題';
    return;
  }
  addError.value = '';
  adding.value = true;
  try {
    const card = await apiFetch('/cards', {
      method: 'POST',
      body: { title: newCard.title, description: newCard.description.trim() },
    });
    columns.todo.unshift(card);
    newCard.title = '';
    newCard.description = '';
  } catch (e) {
    addError.value = e.errors?.title?.[0] ?? e.errors?.description?.[0] ?? e.message;
  } finally {
    adding.value = false;
  }
}

// ---- 編輯 ----
async function saveCard(card, fields) {
  const updated = await apiFetch(`/cards/${card.id}`, { method: 'PATCH', body: fields });
  Object.assign(card, updated);
}

// ---- 拖拉（樂觀更新：畫面已經先變了，失敗才重新載入） ----
async function onDragChange(status, event) {
  let body;
  let card;
  if (event.moved) {
    card = event.moved.element;
    body = { position: event.moved.newIndex };
  } else if (event.added) {
    card = event.added.element;
    body = { status, position: event.added.newIndex };
  } else {
    return; // removed：同一次跨欄拖拉，由目標欄的 added 處理
  }
  boardError.value = '';
  try {
    const updated = await apiFetch(`/cards/${card.id}`, { method: 'PATCH', body });
    card.status = updated.status;
  } catch (e) {
    await reloadAfterError(e);
  }
}

// ---- 刪除 ----
const pendingDelete = ref(null);
const deleting = ref(false);
const deleteError = ref('');

function askDelete(status, card) {
  pendingDelete.value = { status, card };
  deleteError.value = '';
}

function closeDelete() {
  if (!deleting.value) pendingDelete.value = null;
}

async function confirmDelete() {
  const { status, card } = pendingDelete.value;
  deleting.value = true;
  try {
    await apiFetch(`/cards/${card.id}`, { method: 'DELETE' });
    columns[status] = columns[status].filter((c) => c.id !== card.id);
    pendingDelete.value = null;
  } catch (e) {
    if (e.status === 404) {
      pendingDelete.value = null;
      await reloadAfterError(e);
    } else {
      deleteError.value = e.message;
    }
  } finally {
    deleting.value = false;
  }
}

// ---- 登出 ----
async function doLogout() {
  try {
    await logout();
  } finally {
    router.push('/login');
  }
}
</script>

<style scoped>
.site-header {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.brand { font-weight: 700; font-size: 20px; color: var(--heading); letter-spacing: 0.02em; }
.user { display: flex; align-items: center; gap: 16px; font-size: 14px; }
.logout { padding: 3px 12px; }

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 32px;
  margin-bottom: 20px;
}
.summary-text { min-width: 0; }
.greeting { margin: 0; font-size: 24px; font-weight: 500; color: var(--heading); }
.detail { margin: 2px 0 0; color: var(--muted); }
.progress { flex: 0 1 280px; min-width: 200px; }
.progress-label { font-size: 14px; color: var(--muted); margin-bottom: 6px; text-align: right; font-variant-numeric: tabular-nums; }
.progress-label strong { color: var(--heading); font-weight: 600; }
.progress-bar { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
.progress-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width 0.3s; }
@media (max-width: 560px) {
  .progress { flex-basis: 100%; }
  .progress-label { text-align: left; }
}

.top-add {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  background: var(--subtle);
  border-radius: 8px;
  padding: 16px;
}
.top-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: var(--muted);
  flex: 1 1 220px;
  min-width: 0;
}
.top-add .btn { padding: 8px 28px; }
.add-error { margin-top: 8px; }
.banner { margin-top: 12px; }

.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
  margin-top: 16px;
}
@media (max-width: 760px) {
  .board { grid-template-columns: 1fr; }
}

.column {
  background: var(--column);
  border-radius: 8px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.column-head { display: flex; align-items: baseline; justify-content: space-between; padding: 2px 4px; }
.column-head h2 { margin: 0; font-size: 16px; font-weight: 500; color: var(--heading); display: flex; align-items: center; gap: 8px; }
/* 欄名前的小圓點：待辦珊瑚紅、進行中深藍綠、完成灰色 */
.column-head h2::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--dot); }
.column[aria-label="待辦"] { --dot: var(--highlight); }
.column[aria-label="進行中"] { --dot: var(--accent); }
.column[aria-label="完成"] { --dot: var(--faint); }
.count { font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; }

.cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 48px;
  border-radius: 8px;
}
:deep(.drag-ghost) { opacity: 0.4; background: var(--drop); }
/* 空欄：拖拉的卡片一進來（欄裡出現 .card），就把提示插圖藏起來，
   讓佔位直接出現在插圖原本的位置；拖拉中保持原本的高度，欄位不會突然縮小 */
.cards:has(> .empty) { min-height: 156px; }
.cards:has(.card) :deep(.empty) { display: none; }
</style>
