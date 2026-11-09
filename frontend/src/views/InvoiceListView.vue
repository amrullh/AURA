<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getInvoices, retryInvoice } from '@/api/invoices'
import { getBatch, getSummary, type BatchRow } from '@/api/dashboard'
import { pesanError } from '@/api/client'
import { usePolling } from '@/composables/usePolling'
import { useAuthStore } from '@/stores/auth'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { DECISION, PROSES, VERDICT } from '@/utils/status'
import { keyakinan, rupiah } from '@/utils/format'
import type { InvoiceListItem, PageMeta } from '@/types/invoice'

// antrean = true: halaman Antrean saya (hanya invoice milik pengguna, tanpa tombol unggah dan tanpa banner progres).
const props = defineProps<{ antrean?: boolean }>()

const auth = useAuthStore()
const route = useRoute()
const isStaf = computed(() => auth.role === 'STAF_FINANCE')
const isAdmin = computed(() => auth.role === 'ADMIN')
const bisaUlang = computed(() => isStaf.value || isAdmin.value)

const baris = ref<InvoiceListItem[]>([])
const meta = ref<PageMeta | null>(null)
const batch = ref<BatchRow | null>(null)
const jumlahAntrean = ref(0)
const memuat = ref(true)
const galat = ref('')
const galatUlang = ref('')

const cari = ref('')
const fVerdict = ref('')
const fKeputusan = ref('')
const fVendor = ref('')
const halaman = ref(1)
const vendorMap = ref(new Map<string, string>())

const BTN =
  'inline-flex min-h-8 cursor-pointer items-center whitespace-nowrap rounded-full border-[1.5px] border-brand px-3.5 py-1 text-[13px] font-semibold text-brand transition duration-150 hover:bg-brand hover:text-white active:scale-95 active:border-brand-dark active:bg-brand-dark active:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const BTN_BAHAYA =
  'inline-flex min-h-8 cursor-pointer items-center whitespace-nowrap rounded-full border-[1.5px] border-danger px-3.5 py-1 text-[13px] font-semibold text-danger transition duration-150 hover:bg-danger hover:text-white active:scale-95 active:bg-red-950 active:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger'
const PERAN: Record<string, string> = { STAF_FINANCE: 'Staf', VERIFIKATOR: 'Verifikator', ADMIN: 'Admin' }

async function ambil() {
  try {
    const batchId = (route.query.batch_id as string) || undefined
    const [res, ring] = await Promise.all([
      getInvoices({
        q: cari.value || undefined,
        batch_id: batchId,
        queue: props.antrean ? 'mine' : undefined,
        verdict: fVerdict.value || undefined,
        decision_status: fKeputusan.value || undefined,
        vendor_id: fVendor.value || undefined,
        page: halaman.value,
        page_size: 20,
      }),
      getSummary(),
    ])
    baris.value = res.data
    meta.value = res.meta
    res.data.forEach((x) => {
      if (x.vendor_id && x.vendor_name) vendorMap.value.set(x.vendor_id, x.vendor_name)
    })
    jumlahAntrean.value = ring.my_queue_count
    try {
      batch.value = batchId ? await getBatch(batchId) : ring.latest_batch
    } catch {
      batch.value = ring.latest_batch
    }
    galat.value = ''
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat daftar invoice.')
  } finally {
    memuat.value = false
  }
}

const berjalan = (b: InvoiceListItem) => b.processing_status === 'QUEUED' || b.processing_status === 'PROCESSING'
const masihBerjalan = () => baris.value.some(berjalan) || batch.value?.status === 'PROCESSING'
const { muatUlang } = usePolling(ambil, masihBerjalan)

watch([fVerdict, fKeputusan, fVendor, () => route.query.batch_id], () => {
  halaman.value = 1
  muatUlang()
})
let tunda: number | undefined
watch(cari, () => {
  window.clearTimeout(tunda)
  tunda = window.setTimeout(() => {
    halaman.value = 1
    muatUlang()
  }, 350)
})
onBeforeUnmount(() => window.clearTimeout(tunda))

// Saringan juga dijalankan di sisi klien agar tetap benar bila server mengabaikan parameter.
const tampil = computed(() =>
  baris.value.filter(
    (x) =>
      (!fVerdict.value || x.verdict === fVerdict.value) &&
      (!fKeputusan.value || (x.processing_status === 'DONE' && x.decision_status === fKeputusan.value)) &&
      (!fVendor.value || x.vendor_id === fVendor.value),
  ),
)
const opsiVendor = computed(() => [...vendorMap.value.entries()].map(([id, nama]) => ({ id, nama })))
const persenProses = computed(() => (batch.value && batch.value.total ? Math.round((batch.value.completed / batch.value.total) * 100) : 0))

function pemilik(b: InvoiceListItem) {
  if (b.processing_status !== 'DONE' || b.decision_status !== 'PENDING' || !b.queue_owner || b.queue_owner === auth.role) return ''
  return PERAN[b.queue_owner] ?? ''
}

async function ulang(b: InvoiceListItem) {
  galatUlang.value = ''
  try {
    await retryInvoice(b.id)
    b.processing_status = 'QUEUED'
    b.iteration = null
    muatUlang()
  } catch (e) {
    galatUlang.value = pesanError(e, 'Gagal mengulang pemrosesan.')
  }
}

function pindah(n: number) {
  halaman.value = n
  muatUlang()
}
</script>

<template>
  <section class="flex flex-col gap-5">
    <header class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h1 class="font-head text-3xl font-extrabold tracking-tight">{{ antrean ? 'Antrean saya' : 'Daftar invoice' }}</h1>
        <RouterLink v-if="isStaf && !antrean" to="/unggah" class="btn btn-primary">Unggah batch baru</RouterLink>
      </div>
      <p v-if="batch" class="text-sm text-muted">Batch: <i>{{ batch.name }}</i></p>
      <p v-if="antrean" class="text-sm text-muted"><b class="text-ink">{{ jumlahAntrean }}</b> invoice menunggu keputusan Anda. Invoice yang diragukan Aura atau dieskalasi ditangani Verifikator.</p>
    </header>

    <section v-if="batch && !antrean" class="flex flex-wrap items-center gap-4 rounded-2xl bg-brand-light px-6 py-4" aria-label="Progres batch">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-head text-base font-extrabold text-white">A</div>
      <div class="flex min-w-[260px] flex-1 flex-col gap-2">
        <div class="flex flex-wrap justify-between gap-3 text-sm">
          <span class="font-bold text-brand-dark">{{ batch.status === 'PROCESSING' ? 'Aura memproses batch ini' : 'Aura selesai memproses batch ini' }}: <b>{{ batch.completed }}</b> dari <b>{{ batch.total }}</b> selesai</span>
          <span v-if="batch.status === 'PROCESSING'" class="text-[13px] text-muted">Diperbarui otomatis tiap 2 sampai 3 detik</span>
        </div>
        <div role="progressbar" :aria-valuenow="persenProses" aria-valuemin="0" aria-valuemax="100" aria-label="Progres batch" class="h-2.5 overflow-hidden rounded-full bg-brand-tint">
          <div class="h-full bg-brand transition-all duration-500" :style="{ width: persenProses + '%' }" />
        </div>
      </div>
    </section>

    <div class="flex flex-wrap items-end gap-3">
      <label class="flex min-w-[220px] max-w-xs flex-1 flex-col gap-1 text-xs font-semibold text-muted">Cari nomor invoice
        <input v-model="cari" placeholder="Contoh: INV-2026-0412" class="h-11 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink" />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Verdict
        <select v-model="fVerdict" class="h-11 min-w-40 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink"><option value="">Semua</option><option v-for="(v, k) in VERDICT" :key="k" :value="k">{{ v.label }}</option></select>
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Keputusan
        <select v-model="fKeputusan" class="h-11 min-w-40 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink"><option value="">Semua</option><option v-for="(v, k) in DECISION" :key="k" :value="k">{{ v.label }}</option></select>
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Vendor
        <select v-model="fVendor" class="h-11 min-w-52 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink"><option value="">Semua vendor</option><option v-for="v in opsiVendor" :key="v.id" :value="v.id">{{ v.nama }}</option></select>
      </label>
    </div>

    <p v-if="galat" role="alert" class="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }} <button class="font-bold underline" @click="muatUlang">Coba lagi</button></p>
    <p v-if="galatUlang" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galatUlang }}</p>

    <div class="overflow-x-auto rounded-2xl border border-line bg-white">
      <table class="w-full min-w-[960px] border-collapse whitespace-nowrap text-sm">
        <thead>
          <tr class="bg-brand-light text-left text-xs text-muted">
            <th class="px-3 py-2">No. invoice</th><th class="px-3 py-2">Vendor</th>
            <th class="px-3 py-2 text-right">Total (Rp)</th><th class="px-3 py-2">Proses</th>
            <th class="px-3 py-2">Verdict</th><th class="px-3 py-2">Keyakinan</th>
            <th class="px-3 py-2">Keputusan</th><th class="w-px px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="memuat"><td colspan="8" class="px-3 py-10 text-center text-muted">Memuat...</td></tr>
          <tr v-else-if="!tampil.length">
            <td colspan="8" class="px-3 py-10 text-center text-muted">
              {{ antrean ? 'Antrean kosong. Semua invoice sudah diputuskan.' : 'Belum ada invoice yang cocok.' }}
              <RouterLink v-if="isStaf && !antrean" to="/unggah" class="ml-1 font-semibold text-brand underline">Unggah batch</RouterLink>
            </td>
          </tr>
          <tr v-for="b in tampil" :key="b.id" class="border-t border-line" :class="{ 'bg-red-50': b.processing_status === 'FAILED' }">
            <td class="px-3 py-2 font-bold">
              <template v-if="b.invoice_number">{{ b.invoice_number }}</template>
              <span v-else-if="b.processing_status === 'FAILED'" class="text-red-900">(belum terbaca)</span>
              <i v-else class="font-normal text-slate-500">Menunggu dibaca</i>
            </td>
            <td class="px-3 py-2">
              <template v-if="b.vendor_name">{{ b.vendor_name }}</template>
              <span v-else-if="berjalan(b)" class="inline-block h-3 w-28 animate-pulse rounded-full bg-slate-200 align-middle" />
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="px-3 py-2 text-right">
              <template v-if="b.total_amount != null">{{ rupiah(b.total_amount).replace('Rp ', '') }}</template>
              <span v-else-if="berjalan(b)" class="inline-block h-3 w-16 animate-pulse rounded-full bg-slate-200 align-middle" />
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="px-3 py-2">
              <StatusBadge v-bind="PROSES[b.processing_status]" />
              <span v-if="b.processing_status === 'QUEUED'" class="ml-2 text-xs text-muted">menunggu giliran</span>
              <span v-else-if="b.processing_status === 'PROCESSING'" class="ml-2 inline-flex items-center gap-1.5 align-middle">
                <span class="inline-flex gap-1" aria-hidden="true"><span v-for="n in 3" :key="n" class="h-1.5 w-4 rounded-full" :class="n <= (b.iteration ?? 0) ? 'bg-sky-500' : 'bg-slate-200'" /></span>
                <span class="text-xs text-muted">iterasi <b class="text-ink">{{ b.iteration ?? 1 }}</b> dari 3</span>
              </span>
            </td>
            <td class="px-3 py-2">
              <StatusBadge v-if="b.verdict" v-bind="VERDICT[b.verdict]" />
              <span v-else-if="berjalan(b)" class="inline-block h-5 w-20 animate-pulse rounded-full bg-slate-200 align-middle" />
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="px-3 py-2">
              <template v-if="b.confidence != null">{{ keyakinan(b.confidence) }}</template>
              <span v-else-if="berjalan(b)" class="inline-block h-3 w-8 animate-pulse rounded-full bg-slate-200 align-middle" />
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="px-3 py-2">
              <template v-if="b.processing_status === 'DONE'">
                <StatusBadge v-bind="DECISION[b.decision_status]" />
                <span v-if="pemilik(b)" class="ml-2 text-xs text-muted">{{ pemilik(b) }}</span>
              </template>
              <span v-else-if="berjalan(b)" class="inline-block h-5 w-16 animate-pulse rounded-full bg-slate-200 align-middle" />
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="px-3 py-2 text-right">
              <RouterLink v-if="b.processing_status === 'DONE' || b.processing_status === 'PROCESSING'" :to="`/invoice/${b.id}`" :class="BTN">Buka</RouterLink>
              <button v-else-if="b.processing_status === 'FAILED' && bisaUlang" type="button" :class="BTN_BAHAYA" @click="ulang(b)">Coba ulang</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="meta" class="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
      <div>Halaman <b class="text-ink">{{ meta.page }}</b> dari <b class="text-ink">{{ meta.total_pages }}</b></div>
      <div class="flex gap-2">
        <button type="button" :disabled="meta.page <= 1" class="min-h-10 cursor-pointer rounded-full border-[1.5px] border-brand px-5 font-semibold text-brand transition hover:bg-brand hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-transparent disabled:text-slate-400" @click="pindah(meta.page - 1)">Sebelumnya</button>
        <button type="button" :disabled="meta.page >= meta.total_pages" class="min-h-10 cursor-pointer rounded-full border-[1.5px] border-brand px-5 font-semibold text-brand transition hover:bg-brand hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-transparent disabled:text-slate-400" @click="pindah(meta.page + 1)">Berikutnya</button>
      </div>
    </div>
  </section>
</template>