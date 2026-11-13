import { createRouter, createWebHistory } from 'vue-router';
import { loadCurrentUser } from '../auth.js';
import BoardView from '../views/BoardView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: BoardView, meta: { requiresAuth: true } },
    { path: '/login', component: LoginView, meta: { guestOnly: true } },
    { path: '/register', component: RegisterView, meta: { guestOnly: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

// 路由守衛：未登入不能進看板，已登入不用再看登入／註冊頁
router.beforeEach(async (to) => {
  const user = await loadCurrentUser().catch(() => null);
  if (to.meta.requiresAuth && !user) return '/login';
  if (to.meta.guestOnly && user) return '/';
});

export default router;
