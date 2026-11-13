<!-- 登入、註冊頁共用的外框：置中的卡片 -->
<template>
  <main class="auth-page">
    <div class="auth-card">
      <h1>{{ title }}</h1>
      <slot />
    </div>
  </main>
</template>

<script setup>
defineProps({ title: { type: String, required: true } });
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 64px 16px 32px;
}
.auth-card {
  width: 100%;
  max-width: 360px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
h1 { margin: 0 0 4px; font-size: 22px; }
:slotted(form) { display: flex; flex-direction: column; gap: 14px; }
:slotted(label) { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--muted); }
:slotted(.btn[type="submit"]) { padding: 9px; font-size: 15px; }
:slotted(.switch) { font-size: 14px; color: var(--muted); text-align: center; margin: 0; }
:slotted(.notice) { font-size: 14px; color: var(--accent); margin: 0; }
</style>
