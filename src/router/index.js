import { createRouter, createWebHistory } from 'vue-router';
import { hasStoredKey } from '../services/api';
import Dashboard from '../views/Dashboard.vue';
import Fees from '../views/Fees.vue';
import Alpha from '../views/Alpha.vue';
import Points from '../views/Points.vue';
import Accounts from '../views/Accounts.vue';
import Login from '../views/Login.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login, meta: { title: 'Đăng nhập', public: true } },
    { path: '/', name: 'dashboard', component: Dashboard, meta: { title: 'Dashboard' } },
    { path: '/fees', name: 'fees', component: Fees, meta: { title: 'Phí Trade' } },
    { path: '/alpha', name: 'alpha', component: Alpha, meta: { title: 'Dự án Alpha' } },
    { path: '/points', name: 'points', component: Points, meta: { title: 'Điểm Alpha' } },
    { path: '/accounts', name: 'accounts', component: Accounts, meta: { title: 'Tài khoản' } },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!(await hasStoredKey())) return { name: 'login' };
  return true;
});

export default router;
