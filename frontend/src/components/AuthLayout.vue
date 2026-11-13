<!-- 登入、註冊頁共用的外框：置中的卡片 -->
<template>
  <header class="site-header">
    <div class="header-inner"><span class="brand">我的看板</span></div>
  </header>
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
.site-header { border-bottom: 1px solid var(--line); background: var(--surface); }
.header-inner { max-width: 1200px; margin: 0 auto; padding: 16px; }
.brand { font-weight: 700; font-size: 20px; color: var(--heading); letter-spacing: 0.02em; }
.auth-page {
  display: flex;
  justify-content: center;
  padding: 56px 16px 40px;
}
.auth-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
h1 { margin: 0 0 4px; font-size: 26px; font-weight: 500; color: var(--heading); text-align: center; }
:slotted(form) { display: flex; flex-direction: column; gap: 16px; }
:slotted(label) { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: var(--fg); }
:slotted(.btn[type="submit"]) { padding: 10px; font-size: 15px; margin-top: 4px; }
:slotted(.switch) { font-size: 14px; color: var(--muted); text-align: center; margin: 4px 0 0; padding-top: 16px; border-top: 1px solid var(--line); }
:slotted(.notice) { font-size: 14px; color: var(--accent); background: var(--drop); border-radius: 6px; padding: 8px 12px; margin: 0; }
</style>
