<!-- 看板頁：上方新增表單，下面待辦／進行中／完成三欄，卡片可拖拉 -->
<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">我的看板</div>
      <div class="user">
        <span>{{ currentUser?.name }}</span>
        <button type="button" class="link-btn" @click="doLogout">登出</button>
      </div>
    </header>

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
          ghost-class="ghost"
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
            <div v-if="columns[col.key].length === 0" class="empty">把卡片拖到這裡</div>
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
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';
import CardItem from '../components/CardItem.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
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
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 0 20px;
}
.brand { font-weight: 700; font-size: 18px; }
.user { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 14px; }

.top-add {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px;
}
.top-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
  flex: 1 1 200px;
  min-width: 0;
}
.top-add .btn { padding: 7px 20px; }
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
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.column-head { display: flex; align-items: baseline; justify-content: space-between; padding: 2px 4px; }
.column-head h2 { margin: 0; font-size: 15px; font-weight: 700; }
.count { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }

.cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 48px;
  border-radius: 8px;
}
.empty { color: var(--muted); font-size: 13px; text-align: center; padding: 14px 0; }
:deep(.ghost) { opacity: 0.4; background: var(--drop); }
</style>
