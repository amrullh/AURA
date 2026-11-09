<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getSummary, type Summary } from '@/api/dashboard'
import { pesanError } from '@/api/client'
import { usePolling } from '@/composables/usePolling'
import { useAuthStore } from '@/stores/auth'
import { waktuWib } from '@/utils/format'

const auth = useAuthStore()
const data = ref<Summary | null>(null)
const galat = ref('')

async function ambil() {
  try {
    data.value = await getSummary()
    galat.value = ''
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat beranda.')
  }
}
const { muatUlang } = usePolling(ambil, () => data.value?.latest_batch.status === 'PROCESSING')

const b = computed(() => data.value?.latest_batch)
// Invoice yang sudah dianalisis = jumlah keempat verdict (bukan 'completed', yang ikut menghitung yang gagal).
const analisis = computed(() =>
  b.value ? b.value.counts.clean + b.value.counts.exception + b.value.counts.duplicate + b.value.counts.needs_review : 0,
)
const persenLolos = computed(() => (b.value && b.value.total ? Math.round((b.value.counts.clean / b.value.total) * 100) : 0))
const berjalan = computed(() => (b.value ? b.value.total - b.value.completed : 0))
const isStaf = computed(() => auth.role === 'STAF_FINANCE')
const isVerif = computed(() => auth.role === 'VERIFIKATOR')
const isAdmin = computed(() => auth.role === 'ADMIN')

const VERDICT_TILE = [
  { k: 'clean', label: 'CLEAN', cls: 'bg-lime-100 text-lime-900' },
  { k: 'exception', label: 'EXCEPTION', cls: 'bg-amber-100 text-amber-900' },
  { k: 'duplicate', label: 'DUPLICATE', cls: 'bg-violet-100 text-violet-900' },
  { k: 'needs_review', label: 'NEEDS_REVIEW', cls: 'bg-pink-100 text-pink-900' },
] as const
</script>

<template>
  <p v-if="galat && !data" role="alert" class="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
    {{ galat }} <button class="font-bold underline" @click="muatUlang">Coba lagi</button>
  </p>
  <p v-else-if="!data || !b" class="text-muted">Memuat...</p>

  <div v-else class="flex flex-col gap-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-head text-3xl font-extrabold tracking-tight">Beranda</h1>
      <RouterLink v-if="isStaf" to="/unggah" class="btn btn-primary">Unggah batch baru</RouterLink>
    </header>

    <!-- Panel Aura (semua peran) -->
    <section class="flex flex-col gap-5 rounded-3xl bg-brand-light p-7">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex size-11 items-center justify-center rounded-full bg-brand font-head text-xl font-extrabold text-white">A</div>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand-dark">
          <span class="size-2 rounded-full bg-brand" :class="{ 'animate-pulse': b.status === 'PROCESSING' }" />
          {{ b.status === 'PROCESSING' ? 'Aura sedang bekerja' : 'Aura selesai memproses' }}
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
          <span class="size-2 rounded-full bg-teal-200" />
          <span class="sr-only">{{ b.status === 'PROCESSING' ? 'Batch aktif: ' : 'Batch terakhir: ' }}</span>{{ b.name }}
        </span>
      </div>

      <div class="font-head text-3xl font-extrabold leading-tight tracking-tight">{{ analisis }} dari {{ b.total }} invoice sudah dianalisis Aura</div>

      <div class="flex items-center gap-3">
        <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-tint"><div class="h-full bg-brand" :style="{ width: persenLolos + '%' }" /></div>
        <span class="text-[13px] font-semibold text-brand-dark">{{ persenLolos }}% lolos</span>
      </div>

      <div class="grid gap-3.5 md:grid-cols-3">
        <div class="rounded-2xl bg-white px-6 py-5"><div class="font-head text-3xl font-extrabold">{{ b.counts.clean }} dari {{ b.total }}</div><div class="mt-1.5 text-[13px] text-muted">Lolos otomatis</div></div>
        <div class="rounded-2xl bg-white px-6 py-5"><div class="font-head text-3xl font-extrabold">{{ isVerif ? data.my_queue_count : b.counts.pending_decision }}</div><div class="mt-1.5 text-[13px] text-muted">{{ isAdmin ? 'Menunggu keputusan' : 'Menunggu keputusan Anda' }}</div></div>
        <div class="rounded-2xl bg-white px-6 py-5"><div class="font-head text-3xl font-extrabold">{{ b.counts.failed }}</div><div class="mt-1.5 text-[13px] text-muted">Gagal dibaca</div></div>
      </div>

      <p class="flex items-center gap-2 text-xs text-slate-500">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
        Aura hanya menyiapkan temuan dan rekomendasi.
      </p>
    </section>

    <!-- Verifikator: antrean dan keputusan hari ini -->
    <div v-if="isVerif" class="grid gap-5 md:grid-cols-2">
      <section class="flex flex-col gap-3" aria-label="Antrean review dan eskalasi">
        <h2 class="text-center font-head text-base font-extrabold">Antrean review dan eskalasi</h2>
        <div class="flex flex-1 flex-col gap-3.5 rounded-3xl border border-slate-300 bg-slate-50 p-4">
          <div class="grid grid-cols-2 gap-3.5">
            <div class="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white py-9"><span class="font-head text-5xl font-extrabold">{{ data.needs_review_count }}</span><span class="rounded-full bg-pink-100 px-2.5 py-1 text-xs font-semibold text-pink-900">NEEDS_REVIEW</span></div>
            <div class="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white py-9"><span class="font-head text-5xl font-extrabold">{{ data.escalated_count }}</span><span class="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-900">ESCALATED</span></div>
          </div>
          <div class="flex min-h-11 items-center justify-center">
            <RouterLink to="/antrean" class="btn btn-primary">Buka antrean</RouterLink>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3" aria-label="Keputusan hari ini">
        <h2 class="text-center font-head text-base font-extrabold">Keputusan Anda hari ini</h2>
        <div class="flex flex-1 flex-col gap-3.5 rounded-3xl border border-slate-300 bg-slate-50 p-4">
          <div class="grid grid-cols-2 gap-3.5">
            <div class="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white py-9"><span class="font-head text-5xl font-extrabold">{{ data.decided_today?.approved }}</span><span class="rounded-full bg-lime-800 px-2.5 py-1 text-xs font-semibold text-white">APPROVED</span></div>
            <div class="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white py-9"><span class="font-head text-5xl font-extrabold">{{ data.decided_today?.rejected }}</span><span class="rounded-full bg-red-800 px-2.5 py-1 text-xs font-semibold text-white">REJECTED</span></div>
          </div>
          <p class="flex min-h-11 items-center justify-center gap-2 text-xs text-slate-500">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
            Keputusan Verifikator bersifat final.
          </p>
        </div>
      </section>
    </div>

    <!-- Admin: pengguna aktif -->
    <section v-if="isAdmin && data.active_users_by_role" class="flex flex-col gap-3">
      <h2 class="font-head text-base font-extrabold">Pengguna aktif per peran</h2>
      <div class="grid gap-4 md:grid-cols-3">
        <div class="flex flex-col items-center gap-2 rounded-3xl border border-line bg-white py-7"><span class="font-head text-5xl font-extrabold">{{ data.active_users_by_role.STAF_FINANCE }}</span><span class="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-semibold text-brand-dark">Staf Finance</span></div>
        <div class="flex flex-col items-center gap-2 rounded-3xl border border-line bg-white py-7"><span class="font-head text-5xl font-extrabold">{{ data.active_users_by_role.VERIFIKATOR }}</span><span class="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Verifikator</span></div>
        <div class="flex flex-col items-center gap-2 rounded-3xl border border-line bg-white py-7"><span class="font-head text-5xl font-extrabold">{{ data.active_users_by_role.ADMIN }}</span><span class="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">Admin</span></div>
      </div>
    </section>

    <!-- Staf: Antrean saya dan Ringkasan batch terakhir dalam satu baris -->
    <div class="grid items-stretch gap-5" :class="isStaf ? 'lg:grid-cols-[260px_1fr]' : ''">
      <section v-if="isStaf" class="flex flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-white p-8 text-center" aria-label="Antrean saya">
        <h2 class="font-head text-base font-extrabold">Antrean saya</h2>
        <span class="font-head text-6xl font-extrabold">{{ data.my_queue_count }}</span>
        <span class="text-[13px] text-muted">invoice menunggu keputusan Anda</span>
        <RouterLink to="/antrean" class="btn btn-primary">Buka antrean</RouterLink>
      </section>

      <section class="flex flex-col gap-4" aria-label="Ringkasan batch terakhir">
        <h2 class="font-head text-base font-extrabold">Ringkasan batch terakhir</h2>
        <div class="grid flex-1 gap-5 lg:grid-cols-[3fr_2fr]">
          <div class="flex flex-col gap-2.5">
            <div class="text-sm font-semibold text-muted">Hasil analisis Aura: <b class="font-extrabold text-ink">{{ analisis }}</b> invoice dianalisis</div>
            <div class="grid flex-1 grid-cols-2 gap-3 rounded-3xl border border-line bg-white p-5">
              <div v-for="t in VERDICT_TILE" :key="t.k" class="flex items-center justify-between rounded-2xl border border-line px-5 py-4">
                <span class="rounded-full px-2.5 py-1 text-[13px] font-semibold" :class="t.cls">{{ t.label }}</span>
                <span class="font-head text-3xl font-extrabold">{{ b.counts[t.k] }}</span>
              </div>
            </div>
          </div>
          <div class="flex flex-col gap-2.5">
            <div class="text-sm font-semibold text-muted">Status pemrosesan: <b class="font-extrabold text-ink">{{ b.total }}</b> invoice</div>
            <div class="flex flex-1 flex-col gap-3 rounded-3xl border border-line bg-white p-5">
              <div class="flex items-center justify-between rounded-2xl border border-line px-5 py-4"><span class="text-[13px] font-semibold text-slate-700">Selesai</span><span class="font-head text-3xl font-extrabold">{{ analisis }}</span></div>
              <div class="flex items-center justify-between rounded-2xl border border-line px-5 py-4"><span class="rounded-full bg-sky-100 px-2.5 py-1 text-[13px] font-semibold text-sky-900">Antre atau diproses</span><span class="font-head text-3xl font-extrabold">{{ berjalan }}</span></div>
              <div class="flex items-center justify-between rounded-2xl border border-line px-5 py-4"><span class="rounded-full bg-red-100 px-2.5 py-1 text-[13px] font-semibold text-red-900">Gagal</span><span class="font-head text-3xl font-extrabold">{{ b.counts.failed }}</span></div>
            </div>
          </div>
        </div>
        <p class="text-[13px] text-muted"><i>{{ b.name }}</i>, <b class="font-extrabold text-ink">{{ b.total }}</b> invoice, diunggah <i>{{ waktuWib(b.created_at) }}</i></p>
      </section>
    </div>

    <section class="flex flex-col gap-3">
      <h2 class="font-head text-base font-extrabold">Batch terbaru</h2>
      <div class="overflow-x-auto rounded-2xl border border-line bg-white">
        <table class="w-full min-w-[800px] border-collapse text-sm">
          <thead><tr class="bg-brand-light text-left text-xs text-muted">
            <th class="px-3.5 py-3">Nama batch</th><th class="px-3.5 py-3">Waktu unggah</th><th class="px-3.5 py-3">Progres</th><th class="px-3.5 py-3">Status</th><th class="px-3.5 py-3 text-right">Perlu tindakan</th>
          </tr></thead>
          <tbody>
            <tr v-for="r in data.recent_batches" :key="r.id" class="border-t border-line">
              <td class="px-3.5 py-4 font-bold">{{ r.name }}</td>
              <td class="px-3.5 py-4">{{ waktuWib(r.created_at) }}</td>
              <td class="px-3.5 py-4">{{ r.completed }} dari {{ r.total }} selesai</td>
              <td class="px-3.5 py-4"><span v-if="r.status === 'PROCESSING'" class="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Diproses</span><span v-else class="text-slate-700">Selesai</span></td>
              <td class="px-3.5 py-4 text-right font-bold">{{ r.counts.pending_decision }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>