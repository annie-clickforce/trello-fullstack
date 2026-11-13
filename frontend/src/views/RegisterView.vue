<template>
  <AuthLayout title="註冊">
    <form novalidate @submit.prevent="submit">
      <label>
        名稱
        <input id="reg-name" v-model="name" class="field" type="text" maxlength="100" autocomplete="name" />
        <span v-if="errors.name" class="error">{{ errors.name[0] }}</span>
      </label>
      <label>
        Email
        <input id="reg-email" v-model="email" class="field" type="email" autocomplete="email" />
        <span v-if="errors.email" class="error">{{ errors.email[0] }}</span>
      </label>
      <label>
        密碼（至少 8 個字元）
        <input id="reg-password" v-model="password" class="field" type="password" autocomplete="new-password" />
        <span v-if="errors.password" class="error">{{ errors.password[0] }}</span>
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn" type="submit" :disabled="submitting">{{ submitting ? '註冊中…' : '註冊' }}</button>
      <p class="switch">已經有帳號？<RouterLink to="/login">登入</RouterLink></p>
    </form>
  </AuthLayout>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthLayout from '../components/AuthLayout.vue';
import { apiFetch } from '../api.js';

const router = useRouter();
const name = ref('');
const email = ref('');
const password = ref('');
const errors = ref({});
const error = ref('');
const submitting = ref(false);

async function submit() {
  errors.value = {};
  error.value = '';
  submitting.value = true;
  try {
    await apiFetch('/auth/register', {
      method: 'POST',
      body: { name: name.value, email: email.value, password: password.value },
    });
    // 註冊後不會自動登入，帶著提示回到登入頁
    router.push({ path: '/login', query: { registered: '1' } });
  } catch (e) {
    errors.value = e.errors ?? {};
    if (Object.keys(errors.value).length === 0) error.value = e.message;
  } finally {
    submitting.value = false;
  }
}
</script>
