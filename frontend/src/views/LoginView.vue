<template>
  <AuthLayout title="登入">
    <form novalidate @submit.prevent="submit">
      <p v-if="route.query.registered" class="notice">註冊成功，請登入。</p>
      <label>
        Email
        <input id="login-email" v-model="email" class="field" type="email" autocomplete="email" required />
      </label>
      <label>
        密碼
        <input id="login-password" v-model="password" class="field" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn" type="submit" :disabled="submitting">{{ submitting ? '登入中…' : '登入' }}</button>
      <p class="switch">還沒有帳號？<RouterLink to="/register">註冊</RouterLink></p>
    </form>
  </AuthLayout>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthLayout from '../components/AuthLayout.vue';
import { login } from '../auth.js';

const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);

async function submit() {
  if (!email.value.trim() || !password.value) {
    error.value = '請輸入 Email 和密碼';
    return;
  }
  error.value = '';
  submitting.value = true;
  try {
    await login(email.value, password.value);
    router.push('/');
  } catch (e) {
    // 欄位格式錯誤也一律顯示同一句，避免透露細節
    error.value = e.status === 422 ? 'Email 或密碼錯誤' : e.message;
  } finally {
    submitting.value = false;
  }
}
</script>
