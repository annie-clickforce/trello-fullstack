<!-- 沒有卡片的欄：線條圖示＋提示文字，同時也是拖拉的放置區 -->
<template>
  <div class="empty">
    <svg viewBox="0 0 64 48" width="64" height="48" aria-hidden="true">
      <!-- 兩張疊在一起的卡片 -->
      <rect x="14" y="6" width="40" height="28" rx="4" class="back" />
      <rect x="8" y="12" width="40" height="28" rx="4" class="front" />
      <line x1="14" y1="21" x2="34" y2="21" class="text" />
      <line x1="14" y1="28" x2="28" y2="28" class="text" />
      <!-- 待辦：加號；進行中：箭頭；完成：勾 -->
      <g v-if="status === 'todo'" class="mark">
        <circle cx="48" cy="38" r="8" />
        <line x1="48" y1="34" x2="48" y2="42" /><line x1="44" y1="38" x2="52" y2="38" />
      </g>
      <g v-else-if="status === 'doing'" class="mark">
        <circle cx="48" cy="38" r="8" />
        <polyline points="45,34 49,38 45,42" />
      </g>
      <g v-else class="mark">
        <circle cx="48" cy="38" r="8" />
        <polyline points="44,38 47,41 52,35" />
      </g>
    </svg>
    <p class="title">{{ copy.title }}</p>
    <p class="hint">{{ copy.hint }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ status: { type: String, required: true } });

const COPY = {
  todo: { title: '沒有待辦事項', hint: '從上方新增一張卡片' },
  doing: { title: '還沒有進行中的工作', hint: '把正在處理的卡片拖到這裡' },
  done: { title: '還沒有完成的卡片', hint: '做完的卡片拖到這裡' },
};
const copy = computed(() => COPY[props.status]);
</script>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  padding: 28px 12px 24px;
  border: 1px dashed var(--line-strong);
  border-radius: 6px;
}
svg { margin-bottom: 8px; }
.back { fill: var(--subtle); stroke: var(--line-strong); stroke-width: 1.5; }
.front { fill: var(--surface); stroke: var(--faint); stroke-width: 1.5; }
.text { stroke: var(--line-strong); stroke-width: 2.5; stroke-linecap: round; }
.mark circle { fill: var(--surface); stroke: var(--dot, var(--faint)); stroke-width: 1.5; }
.mark line, .mark polyline { fill: none; stroke: var(--dot, var(--faint)); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.title { margin: 0; font-size: 14px; color: var(--fg); }
.hint { margin: 0; font-size: 14px; color: var(--muted); }
</style>
