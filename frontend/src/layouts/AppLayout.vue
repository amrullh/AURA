<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'

const auth = useAuthStore()
const router = useRouter()
const menuTerbuka = ref(false)

const MENU: Record<Role, { to: string; label: string }[]> = {
  STAF_FINANCE: [
    { to: '/beranda', label: 'Beranda' },
    { to: '/unggah', label: 'Unggah batch' },
    { to: '/invoice', label: 'Daftar invoice' },
    { to: '/antrean', label: 'Antrean saya' },
    { to: '/laporan', label: 'Laporan dan metrik' },
  ],
  VERIFIKATOR: [
    { to: '/beranda', label: 'Beranda' },
    { to: '/antrean', label: 'Antrean review dan eskalasi' },
    { to: '/invoice', label: 'Daftar invoice' },
  ],
  ADMIN: [
    { to: '/beranda', label: 'Beranda' },
    { to: '/invoice', label: 'Daftar invoice' },
    { to: '/laporan', label: 'Laporan dan metrik' },
    { to: '/audit', label: 'Jejak audit' },
    { to: '/master', label: 'Data master' },
  ],
}
const LABEL_PERAN: Record<Role, string> = {
  STAF_FINANCE: 'Staf Finance', VERIFIKATOR: 'Verifikator', ADMIN: 'Admin',
}

const menu = computed(() => (auth.role ? MENU[auth.role] : []))

function keluar() {
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-[1280px] flex-col gap-3 px-5 py-4">
    <nav aria-label="Menu utama" class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2">
      <div class="flex items-center gap-2.5">
        <div class="flex size-9 items-center justify-center rounded-xl bg-brand font-head text-lg font-extrabold text-white" aria-hidden="true">A</div>
        <div>
          <div class="font-head text-xl font-extrabold leading-none tracking-tight">Aura</div>
          <div class="text-[11px] text-muted">Automated Reconciliation Agent</div>
        </div>
      </div>

      <div class="flex gap-1.5">
        <RouterLink
          v-for="m in menu" :key="m.to" :to="m.to"
          class="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-slate-700 hover:bg-brand-light hover:text-brand"
          active-class="bg-brand! text-white! font-semibold!"
        >{{ m.label }}</RouterLink>
      </div>

      <div class="relative flex justify-end">
        <button
          type="button" aria-haspopup="menu" :aria-expanded="menuTerbuka"
          class="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full border border-slate-300 bg-white py-1 pl-1.5 pr-3 shadow-sm transition duration-150 hover:border-brand hover:shadow-md active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          :class="{ 'border-brand shadow-md': menuTerbuka }"
          @click="menuTerbuka = !menuTerbuka"
        >
          <span class="size-8 rounded-full bg-brand-tint" />
          <span class="text-left">
            <span class="block text-sm font-bold">{{ auth.user?.name }}</span>
            <span class="block text-xs text-slate-500">{{ auth.role && LABEL_PERAN[auth.role] }}</span>
          </span>
        </button>

        <div v-if="menuTerbuka" role="menu" class="absolute right-0 top-full z-10 mt-1.5 w-60 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
          <div class="border-b border-line px-3 py-2 text-xs text-muted">{{ auth.user?.email }}</div>
          <template v-if="auth.role === 'ADMIN'">
            <RouterLink role="menuitem" to="/pengaturan" class="block rounded-xl px-3 py-2.5 text-sm hover:bg-brand-light" @click="menuTerbuka = false">Pengaturan</RouterLink>
            <RouterLink role="menuitem" to="/pengguna" class="block rounded-xl px-3 py-2.5 text-sm hover:bg-brand-light" @click="menuTerbuka = false">Pengguna</RouterLink>
          </template>
          <button role="menuitem" type="button" class="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger hover:bg-red-50" @click="keluar">Keluar</button>
        </div>
      </div>
    </nav>

    <main class="flex-1 px-2 py-6">
      <RouterView />
    </main>
  </div>
</template>