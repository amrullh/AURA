<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getAudit, getUsers, type AuditRow } from '@/api/admin'
import { getBatches } from '@/api/dashboard'
import { pesanError } from '@/api/client'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { aksi, DAFTAR_AKSI, LABEL_DETAIL, teksDetail } from '@/utils/audit'
import { waktuWib } from '@/utils/format'
import { unduhCsv } from '@/utils/csv'
import { DECISION } from '@/utils/status'
import type { PageMeta } from '@/types/invoice'

const baris = ref<AuditRow[]>([])
const meta = ref<PageMeta | null>(null)
const pilihan = ref<AuditRow | null>(null)
const memuat = ref(true)
const galat = ref('')

const fAktor = ref('')
const fAksi = ref('')
const dari = ref('')
const sampai = ref('')
const halaman = ref(1)

const peranUser = ref(new Map<string, string>())
const namaBatch = ref(new Map<string, string>())
const PERAN: Record<string, string> = { STAF_FINANCE: 'Staf Finance', VERIFIKATOR: 'Verifikator', ADMIN: 'Admin' }

async function muat() {
  memuat.value = true
  try {
    const res = await getAudit({
      actor_type: fAktor.value || undefined,
      action: fAksi.value || undefined,
      from: dari.value || undefined,
      to: sampai.value || undefined,
      page: halaman.value,
      page_size: 20,
    })
    baris.value = res.data
    meta.value = res.meta
    if (!pilihan.value || !res.data.some((x) => x.id === pilihan.value?.id)) pilihan.value = res.data[0] ?? null
    galat.value = ''
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat jejak audit.')
  } finally {
    memuat.value = false
  }
}

onMounted(async () => {
  // Pelengkap tampilan (peran aktor dan nama batch). Kalau gagal, halaman tetap jalan.
  try { (await getUsers()).data.forEach((u) => peranUser.value.set(u.id, PERAN[u.role] ?? u.role)) } catch { /* abaikan */ }
  try { (await getBatches()).forEach((b) => namaBatch.value.set(b.id, b.name)) } catch { /* abaikan */ }
  muat()
})
watch([fAktor, fAksi, dari, sampai], () => {
  halaman.value = 1
  muat()
})

const tanggalWib = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(iso))

// Saringan juga dijalankan di sisi klien agar tetap benar bila server mengabaikan parameter.
const tampil = computed(() =>
  baris.value.filter((x) => {
    const tgl = tanggalWib(x.created_at)
    return (
      (!fAktor.value || x.actor.type === fAktor.value) &&
      (!fAksi.value || x.action === fAksi.value) &&
      (!dari.value || tgl >= dari.value) &&
      (!sampai.value || tgl <= sampai.value)
    )
  }),
)

function pisahWaktu(iso: string) {
  const [tgl, jam] = waktuWib(iso).split(', ')
  return { tgl, jam: jam ?? '' }
}
function aktorLengkap(a: AuditRow['actor']) {
  if (a.type === 'AGENT') return 'Aura (Agent)'
  const peran = peranUser.value.get(a.id)
  return peran ? `${a.name} (${peran})` : a.name
}
function objek(x: AuditRow) {
  if (x.object_type === 'SETTINGS') return 'Pengaturan'
  if (x.object_type === 'BATCH') return namaBatch.value.get(x.object_id) ?? x.object_id
  if (x.object_type === 'INVOICE') return x.summary.match(/INV-[\w-]+/)?.[0] ?? x.object_id
  return x.object_id
}
function tautan(x: AuditRow) {
  if (x.object_type === 'INVOICE') return `/invoice/${x.object_id}`
  if (x.object_type === 'BATCH') return { path: '/invoice', query: { batch_id: x.object_id } }
  return null
}
function lencanaStatus(v: unknown) {
  const k = String(v) as keyof typeof DECISION
  return DECISION[k] ?? { label: String(v), cls: 'bg-slate-200 text-slate-700' }
}
const adaPerubahanStatus = computed(() => !!(pilihan.value?.detail?.from_status && pilihan.value?.detail?.to_status))
const detailLain = computed(() => Object.entries(pilihan.value?.detail ?? {}).filter(([k]) => k !== 'from_status' && k !== 'to_status'))

function pindah(n: number) {
  halaman.value = n
  muat()
}
const csv = () =>
  unduhCsv('jejak-audit.csv', [
    ['Waktu', 'Aktor', 'Aksi', 'Objek', 'Ringkasan'],
    ...tampil.value.map((x) => [waktuWib(x.created_at), aktorLengkap(x.actor), aksi(x.action), objek(x), x.summary]),
  ])
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-col gap-1.5">
        <h1 class="font-head text-3xl font-extrabold tracking-tight">Jejak audit</h1>
        <div class="flex items-center gap-2 text-sm text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Log ini hanya bertambah. Tidak ada yang dapat mengubah atau menghapus entri.
        </div>
      </div>
      <button type="button" class="btn btn-outline" @click="csv">Ekspor CSV</button>
    </header>

    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Aktor
        <select v-model="fAktor" class="h-11 min-w-48 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink"><option value="">Semua aktor</option><option value="AGENT">Aura (Agent)</option><option value="USER">Pengguna</option></select>
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Aksi
        <select v-model="fAksi" class="h-11 min-w-56 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink"><option value="">Semua aksi</option><option v-for="a in DAFTAR_AKSI" :key="a" :value="a">{{ aksi(a) }}</option></select>
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Dari tanggal
        <input v-model="dari" type="date" class="h-11 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink" />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Sampai tanggal
        <input v-model="sampai" type="date" class="h-11 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink" />
      </label>
    </div>

    <p v-if="galat" role="alert" class="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }} <button class="font-bold underline" @click="muat">Coba lagi</button></p>

    <div class="flex flex-col items-start gap-6 lg:flex-row">
      <div class="w-full min-w-0 overflow-x-auto rounded-2xl border border-line bg-white lg:flex-[3]">
        <table class="w-full border-collapse whitespace-nowrap text-sm">
          <thead>
            <tr class="bg-brand-light text-left text-xs text-muted">
              <th class="px-3 py-2">Waktu</th><th class="px-3 py-2">Aktor</th><th class="px-3 py-2">Aksi</th><th class="px-3 py-2">Objek</th><th class="px-3 py-2">Ringkasan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="memuat"><td colspan="5" class="px-3 py-10 text-center text-muted">Memuat...</td></tr>
            <tr v-else-if="!tampil.length"><td colspan="5" class="px-3 py-10 text-center text-muted">Tidak ada entri yang cocok dengan filter.</td></tr>
            <tr
              v-for="x in tampil" :key="x.id"
              class="cursor-pointer border-t border-line align-top transition hover:bg-brand-light"
              :class="pilihan?.id === x.id && 'bg-brand-light shadow-[inset_3px_0_0_#0F766E]'"
              @click="pilihan = x"
            >
              <td class="px-3 py-2.5 leading-snug"><div>{{ pisahWaktu(x.created_at).tgl }}</div><div class="text-muted">{{ pisahWaktu(x.created_at).jam }}</div></td>
              <td class="px-3 py-2.5"><span class="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" :class="x.actor.type === 'AGENT' ? 'bg-brand-tint text-brand-dark' : 'bg-slate-200 text-slate-700'">{{ x.actor.type === 'AGENT' ? 'Aura (Agent)' : x.actor.name }}</span></td>
              <td class="px-3 py-2.5"><span class="whitespace-nowrap rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand-dark">{{ aksi(x.action) }}</span></td>
              <td class="px-3 py-2.5 font-semibold">{{ objek(x) }}</td>
              <td class="min-w-[220px] whitespace-normal px-3 py-2.5">{{ x.summary }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <aside v-if="pilihan" class="flex w-full flex-col gap-1 rounded-3xl border border-line bg-white p-6 lg:min-w-[340px] lg:flex-[1.3]" aria-label="Detail entri">
        <div class="mb-1 flex items-baseline justify-between"><h2 class="font-head text-lg font-extrabold">Detail entri</h2><span class="text-[13px] text-muted">{{ pilihan.id }}</span></div>
        <div class="flex flex-col gap-1 border-b border-line py-2.5"><span class="text-[13px] text-muted">Waktu</span><b>{{ waktuWib(pilihan.created_at).replace(', ', ' ') }}</b></div>
        <div class="flex flex-col gap-1 border-b border-line py-2.5"><span class="text-[13px] text-muted">Aktor</span><b>{{ aktorLengkap(pilihan.actor) }}</b></div>
        <div class="flex flex-col gap-1 border-b border-line py-2.5"><span class="text-[13px] text-muted">Aksi</span><b>{{ aksi(pilihan.action) }}</b></div>
        <div class="flex flex-col gap-1 border-b border-line py-2.5">
          <span class="text-[13px] text-muted">Objek</span>
          <RouterLink v-if="tautan(pilihan)" :to="tautan(pilihan)!" class="font-bold text-brand underline hover:text-brand-dark">{{ objek(pilihan) }}</RouterLink>
          <b v-else>{{ objek(pilihan) }}</b>
        </div>
        <div v-if="adaPerubahanStatus" class="flex flex-col gap-1.5 border-b border-line py-2.5">
          <span class="text-[13px] text-muted">Perubahan status</span>
          <div class="flex flex-wrap items-center gap-2">
            <StatusBadge v-bind="lencanaStatus(pilihan.detail?.from_status)" />
            <span class="text-sm">menjadi</span>
            <StatusBadge v-bind="lencanaStatus(pilihan.detail?.to_status)" />
          </div>
        </div>
        <div v-for="[k, v] in detailLain" :key="k" class="flex flex-col gap-1 border-b border-line py-2.5 last:border-0"><span class="text-[13px] text-muted">{{ LABEL_DETAIL[k] ?? k }}</span><span class="text-sm leading-relaxed">{{ teksDetail(v) }}</span></div>
      </aside>
    </div>

    <div v-if="meta" class="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
      <div>Halaman <b class="text-ink">{{ meta.page }}</b> dari <b class="text-ink">{{ meta.total_pages }}</b></div>
      <div class="flex gap-2">
        <button type="button" :disabled="meta.page <= 1" class="btn btn-outline disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-transparent disabled:text-slate-400 disabled:shadow-none" @click="pindah(meta.page - 1)">Sebelumnya</button>
        <button type="button" :disabled="meta.page >= meta.total_pages" class="btn btn-outline disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-transparent disabled:text-slate-400 disabled:shadow-none" @click="pindah(meta.page + 1)">Berikutnya</button>
      </div>
    </div>
  </section>
</template>