<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { pesanError } from '@/api/client'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const lihat = ref(false)
const memuat = ref(false)
const galat = ref('')
const kedaluwarsa = route.query.expired === '1'

// Sandi demo diisi lewat .env (VITE_DEMO_PASSWORD), tidak ditulis di kode.
const sandiDemo = import.meta.env.VITE_DEMO_PASSWORD as string | undefined

const AKUN_DEMO = [
  { label: 'Staf Finance', email: 'staf@demo.id' },
  { label: 'Verifikator', email: 'verif@demo.id' },
  { label: 'Admin', email: 'admin@demo.id' },
]

function isiDemo(e: string) {
  email.value = e
  password.value = sandiDemo ?? ''
  galat.value = ''
}

async function masuk() {
  galat.value = ''
  memuat.value = true
  try {
    await auth.login(email.value.trim(), password.value)
    router.push({ name: 'dasbor' })
  } catch (e) {
    galat.value = pesanError(e, 'Tidak dapat masuk. Periksa koneksi Anda.')
  } finally {
    memuat.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col justify-center gap-10 px-6 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-14">
    <div class="flex max-w-xl flex-col gap-5">
      <div class="flex items-center gap-3">
        <div class="flex size-11 items-center justify-center rounded-2xl bg-brand font-head text-xl font-extrabold text-white">A</div>
        <div class="font-head text-3xl font-extrabold tracking-tight">Aura</div>
      </div>
      <h1 class="font-head text-4xl font-extrabold leading-[1.1] tracking-tight lg:text-5xl">
        Invoice terverifikasi,<br />bisnis berjalan lancar.
      </h1>
      <p class="text-lg text-muted">Cerdas menyelidiki, tegas menjaga kontrol.</p>
    </div>

    <form class="flex w-full max-w-[460px] flex-col gap-4 rounded-3xl border border-line bg-white p-8" @submit.prevent="masuk">
      <h2 class="font-head text-2xl font-extrabold">Masuk</h2>

      <p v-if="kedaluwarsa" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Sesi berakhir, silakan masuk lagi.</p>
      <p v-if="galat" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }}</p>

      <label class="flex flex-col gap-1.5 text-sm font-bold">
        Email
        <input v-model="email" type="email" name="email" autocomplete="username" required class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 font-normal" />
      </label>

      <label class="flex flex-col gap-1.5 text-sm font-bold">
        Kata sandi
        <div class="relative">
          <input v-model="password" :type="lihat ? 'text' : 'password'" name="password" autocomplete="current-password" required class="h-12 w-full rounded-xl border-[1.5px] border-slate-300 px-3.5 pr-28 font-normal" />
          <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-semibold text-brand" @click="lihat = !lihat">{{ lihat ? 'Sembunyikan' : 'Tampilkan' }}</button>
        </div>
      </label>

      <button type="submit" :disabled="memuat" class="min-h-12 rounded-full bg-brand font-semibold text-white disabled:opacity-60">
        {{ memuat ? 'Memeriksa...' : 'Masuk' }}
      </button>

      <div class="rounded-2xl bg-brand-light p-4">
        <div class="mb-2 text-sm font-bold text-brand-dark">Akun demo untuk juri</div>
        <div class="flex flex-wrap gap-2">
          <button v-for="a in AKUN_DEMO" :key="a.email" type="button" class="rounded-full border border-brand px-3.5 py-1.5 text-xs font-semibold text-brand" @click="isiDemo(a.email)">{{ a.label }}</button>
        </div>
      </div>
    </form>
  </div>
</template>