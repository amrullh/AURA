<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getMetrics, getSettings, type Metrics, type Settings } from '@/api/admin'
import { getBatches, type BatchRow } from '@/api/dashboard'
import { pesanError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { rupiah } from '@/utils/format'
import { unduhCsv } from '@/utils/csv'

const auth = useAuthStore()
const m = ref<Metrics | null>(null)
const set = ref<Settings | null>(null)
const daftarBatch = ref<BatchRow[]>([])
const galat = ref('')
const memuat = ref(true)

const fBatch = ref('')
const dari = ref('')
const sampai = ref('')
const cetak = () => window.print()

async function muat() {
  galat.value = ''
  try {
    const [mm, ss] = await Promise.all([
      getMetrics({ batch_id: fBatch.value || undefined, from: dari.value || undefined, to: sampai.value || undefined }),
      getSettings(),
    ])
    m.value = mm
    set.value = ss
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat laporan.')
  } finally {
    memuat.value = false
  }
}
onMounted(async () => {
  try { daftarBatch.value = await getBatches() } catch { /* filter batch bersifat opsional */ }
  muat()
})
watch([fBatch, dari, sampai], muat)
function reset() { fBatch.value = ''; dari.value = ''; sampai.value = '' }

// Semua nilai dari BE bisa kosong atau nol, jadi dijaga agar tidak tampil NaN atau error.
const ada = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
const koma = (n: number | null | undefined, d = 1) => (ada(n) ? n.toFixed(d).replace('.', ',') : '-')

const menitManual = computed(() => set.value?.manual_minutes_per_invoice ?? null)
const analisis = computed(() => (m.value ? m.value.by_verdict.clean + m.value.by_verdict.exception + m.value.by_verdict.duplicate + m.value.by_verdict.needs_review : 0))
const maks = computed(() => (m.value ? Math.max(1, ...Object.values(m.value.by_verdict)) : 1))
const kali = computed(() => {
  const mn = menitManual.value, av = m.value?.avg_processing_seconds
  return ada(mn) && ada(av) && av > 0 ? Math.round((mn * 60) / av) : null
})
const lebarAura = computed(() => {
  const mn = menitManual.value, av = m.value?.avg_processing_seconds
  return ada(mn) && ada(av) && mn > 0 ? Math.min(100, (av / 60 / mn) * 100) : 0
})
const vendorUrut = computed(() => [...(m.value?.by_vendor ?? [])].sort((a, b) => b.difference_total - a.difference_total))
const cakupan = computed(() => {
  if (fBatch.value) return daftarBatch.value.find((x) => x.id === fBatch.value)?.name ?? fBatch.value
  if (dari.value || sampai.value) return `${dari.value || 'awal'} sampai ${sampai.value || 'sekarang'}`
  return 'semua batch'
})

const BAR = [
  { k: 'clean', label: 'CLEAN', cls: 'bg-lime-100 text-lime-900', warna: '#84CC16' },
  { k: 'exception', label: 'EXCEPTION', cls: 'bg-amber-100 text-amber-900', warna: '#F59E0B' },
  { k: 'duplicate', label: 'DUPLICATE', cls: 'bg-violet-100 text-violet-900', warna: '#8B5CF6' },
  { k: 'needs_review', label: 'NEEDS_REVIEW', cls: 'bg-pink-100 text-pink-900', warna: '#EC4899' },
] as const

function csv() {
  if (!m.value) return
  const v = m.value
  unduhCsv('laporan-aura.csv', [
    ['Cakupan', cakupan.value],
    ['Metrik', 'Nilai'],
    ['Total invoice', v.invoices_total],
    ['Waktu rata-rata per invoice (detik)', v.avg_processing_seconds ?? ''],
    ['Lolos otomatis (%)', v.auto_clear_percent],
    ['Total selisih tertangkap (Rp)', v.difference_caught_total],
    ['Tingkat eskalasi (%)', v.escalation_rate_percent],
    ['Estimasi jam dihemat', v.estimated_hours_saved ?? ''],
    [], ['Vendor', 'Jumlah EXCEPTION', 'Total selisih (Rp)'],
    ...vendorUrut.value.map((x) => [x.vendor_name, x.exception_count, x.difference_total]),
  ])
}
</script>

<template>
  <p v-if="galat" role="alert" class="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }} <button class="font-bold underline" @click="muat">Coba lagi</button></p>
  <p v-else-if="memuat && !m" class="text-muted">Memuat...</p>

  <section v-else-if="m" class="flex flex-col gap-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-1.5">
        <h1 class="font-head text-3xl font-extrabold tracking-tight">Laporan dan metrik</h1>
        <p class="text-sm text-muted">Cakupan: <i>{{ cakupan }}</i></p>
      </div>
      <div class="flex gap-2.5">
        <button type="button" class="btn btn-outline" @click="csv">Unduh CSV</button>
        <button type="button" class="btn btn-primary" @click="cetak">Cetak atau simpan PDF</button>
      </div>
    </header>

    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Batch
        <select v-model="fBatch" class="h-11 min-w-56 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink"><option value="">Semua batch</option><option v-for="b in daftarBatch" :key="b.id" :value="b.id">{{ b.name }}</option></select>
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Dari tanggal
        <input v-model="dari" type="date" :disabled="!!fBatch" class="h-11 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink disabled:bg-slate-100" />
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold text-muted">Sampai tanggal
        <input v-model="sampai" type="date" :disabled="!!fBatch" class="h-11 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink disabled:bg-slate-100" />
      </label>
      <button type="button" class="btn btn-outline" @click="reset">Atur ulang</button>
    </div>

    <p v-if="m.invoices_total === 0" class="rounded-2xl border border-line bg-white px-6 py-10 text-center text-muted">Belum ada invoice pada cakupan ini. Ubah filter atau unggah batch.</p>

    <template v-else>
      <section class="flex flex-col gap-5 rounded-3xl bg-brand-light p-7" aria-label="Dampak Aura">
        <div class="flex items-center gap-3">
          <div class="flex size-11 items-center justify-center rounded-full bg-brand font-head text-xl font-extrabold text-white">A</div>
          <div>
            <div class="font-head text-2xl font-extrabold tracking-tight">Dampak Aura pada <b>{{ m.invoices_total }}</b> invoice</div>
            <div class="text-[13px] text-muted">
              <template v-if="ada(menitManual)">Dibandingkan pemeriksaan manual <b class="text-ink">{{ koma(menitManual, 0) }}</b> menit per invoice</template>
              <template v-else>Waktu pemeriksaan manual belum diisi di Pengaturan</template>
            </div>
          </div>
        </div>
        <div class="grid gap-3.5 md:grid-cols-[2fr_1fr_1fr]">
          <div class="rounded-2xl border border-teal-300 bg-white px-7 py-6"><div class="font-head text-5xl font-extrabold text-brand-dark">{{ rupiah(m.difference_caught_total) }}</div><div class="mt-2 text-sm font-bold text-brand-dark">Total selisih tertangkap</div></div>
          <div class="rounded-2xl bg-white px-6 py-6"><div class="font-head text-3xl font-extrabold">{{ ada(m.avg_processing_seconds) ? koma(m.avg_processing_seconds) + ' detik' : '-' }}</div><div class="mt-2 text-[13px] text-muted">Waktu rata-rata per invoice</div></div>
          <div class="rounded-2xl bg-white px-6 py-6">
            <div class="font-head text-3xl font-extrabold">{{ ada(m.estimated_hours_saved) ? koma(m.estimated_hours_saved) + ' jam' : '-' }}</div>
            <div class="mt-2 text-[13px] text-muted">Estimasi waktu dihemat</div>
            <div v-if="!ada(m.estimated_hours_saved)" class="mt-1 text-xs text-muted">Isi waktu manual di Pengaturan.</div>
          </div>
        </div>
      </section>

      <div class="grid gap-5 lg:grid-cols-[1fr_1fr_1.2fr_2.4fr]">
        <section class="flex flex-col justify-center gap-2 rounded-3xl border border-line bg-white p-6"><div class="text-[13px] font-semibold text-muted">Lolos otomatis</div><div class="font-head text-5xl font-extrabold">{{ koma(m.auto_clear_percent) }}%</div><div class="text-[13px] text-muted"><b class="text-ink">{{ m.by_verdict.clean }}</b> dari <b class="text-ink">{{ m.invoices_total }}</b> invoice</div></section>
        <section class="flex flex-col justify-center gap-2 rounded-3xl border border-line bg-white p-6"><div class="text-[13px] font-semibold text-muted">Tingkat eskalasi</div><div class="font-head text-5xl font-extrabold">{{ koma(m.escalation_rate_percent) }}%</div><div class="text-[13px] text-muted">Diteruskan ke Verifikator</div></section>
        <section v-if="auth.role === 'ADMIN'" class="flex flex-col justify-center gap-3 rounded-3xl border border-line bg-white p-6">
          <div class="text-[13px] font-semibold text-muted">Pembanding waktu manual</div>
          <template v-if="ada(menitManual) && ada(m.avg_processing_seconds)">
            <div class="flex items-center gap-2.5 text-sm"><span class="w-14 text-muted">Manual</span><div class="h-3.5 flex-1 rounded-full bg-slate-400" /><b class="w-16 text-right">{{ koma(menitManual, 0) }} menit</b></div>
            <div class="flex items-center gap-2.5 text-sm"><span class="w-14 text-muted">Aura</span><div class="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div class="h-full bg-brand" :style="{ width: lebarAura + '%' }" /></div><b class="w-16 text-right">{{ koma(m.avg_processing_seconds) }} dtk</b></div>
            <div v-if="kali" class="text-[13px] text-muted">Sekitar <b class="text-ink">{{ kali }}</b> kali lebih cepat. Nilai manual diatur di Pengaturan.</div>
          </template>
          <p v-else class="text-[13px] text-muted">Isi waktu manual di Pengaturan untuk melihat perbandingan.</p>
        </section>
        <section class="flex flex-col gap-4 rounded-3xl border border-line bg-white p-6" :class="auth.role === 'ADMIN' ? 'lg:col-span-1' : 'lg:col-span-2'">
          <div class="flex items-baseline justify-between"><h2 class="font-head text-base font-extrabold">Jumlah per verdict</h2><span class="text-[13px] text-muted"><b class="text-ink">{{ analisis }}</b> invoice dianalisis</span></div>
          <div v-for="b in BAR" :key="b.k" class="flex items-center gap-3.5">
            <span class="w-28 rounded-full px-2.5 py-1 text-center text-xs font-semibold" :class="b.cls">{{ b.label }}</span>
            <div class="h-3.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div class="h-full" :style="{ width: (m.by_verdict[b.k] / maks) * 100 + '%', background: b.warna }" /></div>
            <b class="w-9 text-right">{{ m.by_verdict[b.k] }}</b>
          </div>
        </section>
      </div>

      <section class="flex flex-col gap-3" aria-label="Selisih per vendor">
        <div class="flex items-baseline justify-between"><h2 class="font-head text-base font-extrabold">Selisih per vendor</h2><span class="text-[13px] text-muted">Diurutkan dari selisih terbesar</span></div>
        <div class="overflow-x-auto rounded-2xl border border-line bg-white">
          <table class="w-full min-w-[640px] border-collapse text-sm">
            <thead><tr class="bg-brand-light text-left text-xs text-muted"><th class="px-3 py-2">Vendor</th><th class="px-3 py-2 text-right">Jumlah EXCEPTION</th><th class="px-3 py-2 text-right">Total selisih (Rp)</th></tr></thead>
            <tbody>
              <tr v-if="!vendorUrut.length"><td colspan="3" class="px-3 py-8 text-center text-muted">Belum ada selisih yang tercatat.</td></tr>
              <tr v-for="v in vendorUrut" :key="v.vendor_name" class="border-t border-line"><td class="px-3 py-2.5 font-bold">{{ v.vendor_name }}</td><td class="px-3 py-2.5 text-right">{{ v.exception_count }}</td><td class="px-3 py-2.5 text-right font-bold">{{ v.difference_total.toLocaleString('id-ID') }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>