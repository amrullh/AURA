import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'

declare module 'vue-router' {
  interface RouteMeta { roles?: Role[]; public?: boolean }
}

const S: Role = 'STAF_FINANCE', V: Role = 'VERIFIKATOR', A: Role = 'ADMIN'
const page = (n: string) => () => import(`../views/${n}.vue`)

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: page('LoginView'), meta: { public: true } },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        { path: '', redirect: '/beranda' },
        { path: 'beranda', name: 'dasbor', component: page('DashboardView') },
        { path: 'unggah', name: 'unggah', component: page('UploadView'), meta: { roles: [S] } },
        { path: 'invoice', name: 'invoice', component: page('InvoiceListView') },
        { path: 'invoice/:id', name: 'invoice-detail', component: page('InvoiceDetailView') },
        { path: 'antrean', name: 'antrean', component: page('QueueView'), meta: { roles: [S, V] } },
        { path: 'laporan', name: 'laporan', component: page('ReportView'), meta: { roles: [S, A] } },
        { path: 'audit', name: 'audit', component: page('AuditView'), meta: { roles: [A] } },
        { path: 'master', name: 'master', component: page('MasterView'), meta: { roles: [A] } },
        { path: 'pengaturan', name: 'pengaturan', component: page('SettingsView'), meta: { roles: [A] } },
        { path: 'pengguna', name: 'pengguna', component: page('UsersView'), meta: { roles: [A] } },
        { path: '403', name: '403', component: page('ForbiddenView') },
      ],
    },
    { path: '/:pathMatch(.*)*', name: '404', component: page('NotFoundView'), meta: { public: true } },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) {
    if (to.name === 'login' && auth.isLoggedIn) return { name: 'dasbor' }
    return true
  }
  if (!auth.isLoggedIn) return { name: 'login' }
  const roles = to.meta.roles
  if (roles && auth.role && !roles.includes(auth.role)) return { name: '403' }
  return true
})

export default router