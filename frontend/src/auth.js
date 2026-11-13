// 目前登入的使用者（整個前端共用）
import { ref } from 'vue';
import { apiFetch, ApiError } from './api.js';

export const currentUser = ref(null);
let checked = false;

// 第一次呼叫時向後端確認登入狀態，之後沿用結果
export async function loadCurrentUser() {
  if (checked) return currentUser.value;
  try {
    currentUser.value = await apiFetch('/auth/me');
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    currentUser.value = null;
  }
  checked = true;
  return currentUser.value;
}

export async function login(email, password) {
  currentUser.value = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
  checked = true;
}

export async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    clearCurrentUser();
  }
}

export function clearCurrentUser() {
  currentUser.value = null;
  checked = true;
}
