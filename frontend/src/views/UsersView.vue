<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createUser, getUsers, patchUser } from '@/api/admin'
import { pesanError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { waktuWib } from '@/utils/format'
import type { Role, User } from '@/types'

const auth = useAuthStore()
const daftar = ref<User[]>([])
const memuat = ref(true)
const galat = ref('')
const info = ref('')

const LABEL: Record<Role, string> = { STAF_FINANCE: 'Staf Finance', VERIFIKATOR: 'Verifikator', ADMIN: 'Admin' }
const CLS: Record<Role, string> = { STAF_FINANCE: 'bg-brand-tint text-brand-dark', VERIFIKATOR: 'bg-sky-100 text-sky-900', ADMIN: 'bg-slate-200 text-slate-700' }

async function muat() {
  try {
    daftar.value = (await getUsers()).data
    galat.value = ''
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat pengguna.')
  } finally {
    memuat.value = false
  }
}
onMounted(muat)

const sendiri = (u: User) => u.id === auth.user?.id || u.email === auth.user?.email

const ubahId = ref<string | null>(null)
const peranBaru = ref<Role>('STAF_FINANCE')
function mulaiUbah(u: User) { ubahId.value = u.id; peranBaru.value = u.role }

async function aksi(u: User, b: Partial<{ role: Role; is_active: boolean }>) {
  galat.value = ''
  info.value = ''
  try {
    const baru = await patchUser(u.id, b)
    daftar.value = daftar.value.map((x) => (x.id === u.id ? { ...x, ...baru } : x))
    ubahId.value = null
    info.value = `Perubahan untuk ${u.name} disimpan dan tercatat di Jejak audit.`
  } catch (e) {
    galat.value = pesanError(e, 'Perubahan gagal disimpan.')
  }
}

const buka = ref(false)
const form = ref({ name: '', email: '', role: 'STAF_FINANCE' as Role, password: '' })
const galatForm = ref('')
const kirim = ref(false)
const formSah = computed(() => form.value.name.trim() && /\S+@\S+\.\S+/.test(form.value.email) && form.value.password.length >= 8)

async function tambah() {
  galatForm.value = ''
  kirim.value = true
  try {
    const baru = await createUser({ ...form.value, name: form.value.name.trim(), email: form.value.email.trim() })
    daftar.value.push(baru)
    buka.value = false
    form.value = { name: '', email: '', role: 'STAF_FINANCE', password: '' }
    info.value = `Pengguna ${baru.name} ditambahkan.`
  } catch (e) {
    galatForm.value = pesanError(e, 'Pengguna gagal ditambahkan.')
  } finally {
    kirim.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-head text-3xl font-extrabold tracking-tight">Pengguna</h1>
      <button type="button" class="min-h-11 rounded-full bg-brand px-6 font-semibold text-white" @click="buka = true">Tambah pengguna</button>
    </header>

    <p v-if="galat" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }}</p>
    <p v-if="info" role="status" class="rounded-xl bg-brand-light px-4 py-3 text-sm text-brand-dark">{{ info }}</p>

    <div class="overflow-x-auto rounded-2xl border border-line bg-white">
      <table class="w-full min-w-[960px] border-collapse text-sm">
        <thead><tr class="bg-brand-light text-left text-xs text-muted"><th class="px-3.5 py-3">Nama</th><th class="px-3.5 py-3">Email</th><th class="px-3.5 py-3">Peran</th><th class="px-3.5 py-3">Status</th><th class="px-3.5 py-3">Login terakhir</th><th class="px-3.5 py-3">Tindakan</th></tr></thead>
        <tbody>
          <tr v-if="memuat"><td colspan="6" class="px-3.5 py-10 text-center text-muted">Memuat...</td></tr>
          <tr v-for="u in daftar" :key="u.id" class="border-t border-line" :class="sendiri(u) && 'bg-slate-50'">
            <td class="px-3.5 py-4 font-bold">{{ u.name }} <span v-if="sendiri(u)" class="ml-1.5 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-muted">Akun Anda</span></td>
            <td class="px-3.5 py-4">{{ u.email }}</td>
            <td class="px-3.5 py-4">
              <select v-if="ubahId === u.id" v-model="peranBaru" class="h-10 rounded-lg border-[1.5px] border-slate-300 bg-white px-2.5 text-sm"><option v-for="(l, k) in LABEL" :key="k" :value="k">{{ l }}</option></select>
              <span v-else class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="CLS[u.role]">{{ LABEL[u.role] }}</span>
            </td>
            <td class="px-3.5 py-4"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="u.is_active ? 'bg-brand-tint text-brand-dark' : 'bg-slate-200 text-slate-600'">{{ u.is_active ? 'Aktif' : 'Nonaktif' }}</span></td>
            <td class="px-3.5 py-4" :class="!u.last_login_at && 'text-slate-500'">{{ u.last_login_at ? waktuWib(u.last_login_at) : 'Belum pernah masuk' }}</td>
            <td class="px-3.5 py-4">
              <div v-if="sendiri(u)" class="flex items-center gap-2"><button disabled class="min-h-10 cursor-not-allowed rounded-full border-[1.5px] border-slate-300 px-4 text-sm font-semibold text-slate-400">Ubah peran</button><button disabled class="min-h-10 cursor-not-allowed rounded-full border-[1.5px] border-slate-300 px-4 text-sm font-semibold text-slate-400">Nonaktifkan</button><span class="text-[13px] text-muted">Akun sendiri tidak dapat diubah</span></div>
              <div v-else-if="ubahId === u.id" class="flex gap-2"><button class="min-h-10 rounded-full bg-brand px-4 text-sm font-semibold text-white" @click="aksi(u, { role: peranBaru })">Simpan</button><button class="min-h-10 rounded-full border-[1.5px] border-brand px-4 text-sm font-semibold text-brand" @click="ubahId = null">Batal</button></div>
              <div v-else class="flex gap-2">
                <button class="min-h-10 rounded-full border-[1.5px] border-brand px-4 text-sm font-semibold text-brand" @click="mulaiUbah(u)">Ubah peran</button>
                <button v-if="u.is_active" class="min-h-10 rounded-full border-[1.5px] border-danger px-4 text-sm font-semibold text-danger" @click="aksi(u, { is_active: false })">Nonaktifkan</button>
                <button v-else class="min-h-10 rounded-full bg-brand px-4 text-sm font-semibold text-white" @click="aksi(u, { is_active: true })">Aktifkan</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-[13px] text-muted">Perubahan peran dan status tercatat di Jejak audit. Pengguna nonaktif tidak dapat masuk, tetapi riwayat keputusannya tetap tersimpan.</p>

    <div v-if="buka" class="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label="Tambah pengguna" @click.self="buka = false">
      <form class="flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto bg-white p-8 shadow-2xl" @submit.prevent="tambah">
        <div class="flex items-center justify-between"><h2 class="font-head text-xl font-extrabold">Tambah pengguna</h2><button type="button" class="rounded-full border-[1.5px] border-brand px-4 py-2 text-sm font-semibold text-brand" @click="buka = false">Tutup</button></div>
        <label class="flex flex-col gap-1.5 text-sm font-bold">Nama<input v-model="form.name" required placeholder="Nama lengkap" class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 font-normal" /></label>
        <label class="flex flex-col gap-1.5 text-sm font-bold">Email<input v-model="form.email" type="email" required placeholder="nama@perusahaan.id" class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 font-normal" /><span class="text-[13px] font-normal text-muted">Email harus unik.</span></label>
        <label class="flex flex-col gap-1.5 text-sm font-bold">Peran<select v-model="form.role" class="h-12 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 font-normal"><option v-for="(l, k) in LABEL" :key="k" :value="k">{{ l }}</option></select></label>
        <label class="flex flex-col gap-1.5 text-sm font-bold">Sandi awal<input v-model="form.password" type="password" minlength="8" required placeholder="Minimal 8 karakter" class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 font-normal" /><span class="text-[13px] font-normal text-muted">Sampaikan sandi awal langsung kepada pengguna.</span></label>
        <p v-if="galatForm" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galatForm }}</p>
        <div class="mt-auto flex gap-3 border-t border-line pt-5">
          <button type="submit" :disabled="!formSah || kirim" class="min-h-12 rounded-full bg-brand px-8 font-semibold text-white disabled:opacity-50">{{ kirim ? 'Menyimpan...' : 'Simpan' }}</button>
          <button type="button" class="min-h-12 rounded-full border-[1.5px] border-brand px-6 font-semibold text-brand" @click="buka = false">Batal</button>
        </div>
      </form>
    </div>
  </section>
</template>