import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import router from './router/index.js';
import { setUnauthorizedHandler } from './api.js';
import { clearCurrentUser } from './auth.js';

// Session 失效時：清除登入狀態並回到登入頁
setUnauthorizedHandler(() => {
  clearCurrentUser();
  if (router.currentRoute.value.path !== '/login') router.push('/login');
});

createApp(App).use(router).mount('#app');
