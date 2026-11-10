<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { AxiosError } from 'axios'
import { getInvoice } from '@/api/invoices'
import { pesanError } from '@/api/client'
import { usePolling } from '@/composables/usePolling'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import DocumentViewer from '@/components/invoice/DocumentViewer.vue'
import ComparisonTable from '@/components/invoice/ComparisonTable.vue'
import InvestigationTimeline from '@/components/invoice/InvestigationTimeline.vue'
import DecisionBox from '@/components/invoice/DecisionBox.vue'
import { DECISION, PROSES, VERDICT } from '@/utils/status'
import { keyakinan, rupiah, waktuWib } from '@/utils/format'
import type { InvoiceDetail } from '@/types/detail'

const route = useRoute()
const router = useRouter()
const kembali = () => (window.history.state?.back ? router.back() : router.push('/invoice'))
const inv = ref<InvoiceDetail | null>(null)
const memuat = ref(true)
const galat = ref('')

async function ambil() {
  try {
    inv.value = await getInvoice(String(route.params.id))
    galat.value = ''
  } catch (e) {
    if ((e as AxiosError).response?.status === 403) router.replace('/403')
    galat.value = pesanError(e, 'Gagal memuat invoice.')
  } finally {
    memuat.value = false
  }
}

const berjalan = () => inv.value?.processing_status === 'QUEUED' || inv.value?.processing_status === 'PROCESSING'
const { muatUlang } = usePolling(ambil, berjalan)
watch(() => route.params.id, muatUlang)

const BUKTI = { PO: 'PO', GRN: 'GRN', CONTRACT: 'KONTRAK', INVOICE: 'INVOICE' } as const
const rendah = (c: number) => c < 0.75
const nilai = (k: string, v: string | number | null) => (k === 'total_amount' && typeof v === 'number' ? rupiah(v) : String(v ?? '-'))
</script>

<template>
  <p v-if="memuat" class="text-muted">Memuat...</p>
  <p v-else-if="galat && !inv" role="alert" class="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
    {{ galat }} <button class="font-bold underline" @click="muatUlang">Coba lagi</button>
  </p>

  <div v-else-if="inv" class="flex flex-col gap-6">
    <header class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-brand pl-3 pr-4 text-sm font-semibold text-brand transition duration-150 hover:bg-brand hover:text-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="kembali">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Kembali
        </button>
        <div class="text-[13px] text-muted"><RouterLink to="/invoice" class="font-semibold text-brand hover:underline">Daftar invoice</RouterLink> / <i>{{ inv.invoice_number }}</i></div>
      </div>
      <div class="flex flex-wrap items-center gap-3.5">
        <h1 class="font-head text-3xl font-extrabold tracking-tight">{{ inv.invoice_number ?? 'Invoice' }}</h1>
        <StatusBadge v-if="inv.verdict" v-bind="VERDICT[inv.verdict]" />
        <StatusBadge v-if="inv.processing_status === 'DONE'" v-bind="DECISION[inv.decision_status]" />
        <StatusBadge v-else v-bind="PROSES[inv.processing_status]" />
      </div>

      <div v-if="inv.escalation" class="rounded-2xl bg-blue-100 px-6 py-4 text-sm text-blue-950">
        <b>Dieskalasi oleh {{ inv.escalation.by_name }}</b> · {{ waktuWib(inv.escalation.at) }}<br />{{ inv.escalation.reason }}
      </div>
      <div v-else-if="inv.verdict === 'NEEDS_REVIEW'" class="rounded-2xl bg-pink-100 px-6 py-4 text-sm text-pink-950">
        <b>Aura ragu dan tidak mengambil kesimpulan sendiri.</b> {{ inv.review_reason }}
      </div>

      <div class="grid grid-cols-2 overflow-hidden rounded-3xl border border-line bg-white md:grid-cols-6">
        <div class="border-r border-line px-5 py-4"><div class="text-[13px] text-muted">Vendor</div><div class="mt-1 font-bold">{{ inv.vendor_name ?? '-' }}</div></div>
        <div class="border-r border-line px-5 py-4"><div class="text-[13px] text-muted">Referensi PO</div><div class="mt-1 font-bold">{{ inv.po_number ?? '-' }}</div></div>
        <div class="border-r border-line px-5 py-4"><div class="text-[13px] text-muted">Tanggal invoice</div><div class="mt-1 font-bold">{{ inv.invoice_date ?? '-' }}</div></div>
        <div class="border-r border-line px-5 py-4"><div class="text-[13px] text-muted">Total invoice</div><div class="mt-1 font-bold">{{ inv.total_amount != null ? rupiah(inv.total_amount) : '-' }}</div></div>
        <div class="border-r border-line px-5 py-4"><div class="text-[13px] text-muted">Keyakinan Aura</div><div class="mt-1 font-bold">{{ inv.confidence != null ? keyakinan(inv.confidence) : '-' }}</div></div>
        <div class="px-5 py-4" :class="(inv.difference_amount ?? 0) > 0 ? 'bg-red-100 text-red-900' : ''"><div class="text-[13px]">Selisih</div><div class="mt-1 font-extrabold">{{ rupiah(inv.difference_amount ?? 0) }}</div></div>
      </div>
    </header>

    <div v-if="inv.processing_status === 'QUEUED' || inv.processing_status === 'PROCESSING'" class="flex items-center gap-3 rounded-2xl bg-brand-light px-6 py-4 text-sm text-brand-dark">
      <span class="size-2.5 animate-pulse rounded-full bg-brand" /> Aura sedang bekerja pada invoice ini. Langkah penyelidikan muncul di bawah saat selesai.
    </div>

    <div class="flex flex-col items-start gap-6 lg:flex-row">
      <aside class="w-full shrink-0 lg:sticky lg:top-4 lg:w-[440px]">
        <section class="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
          <h2 class="font-head text-base font-extrabold">Dokumen asli</h2>
          <DocumentViewer :key="inv.id" :invoice-id="inv.id" :content-type="inv.file.content_type" />
        </section>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col gap-6">
        <section v-if="inv.extraction" class="flex flex-col gap-3 rounded-3xl border border-line bg-white p-6">
          <h2 class="font-head text-lg font-extrabold">Data hasil ekstraksi</h2>
          <div v-for="f in inv.extraction.fields" :key="f.key" class="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-sm" :class="rendah(f.confidence) ? 'bg-amber-100 text-amber-900' : 'border-b border-line'">
            <span class="w-36 text-muted">{{ f.label }}</span>
            <span class="flex-1 font-semibold">{{ nilai(f.key, f.value) }}</span>
            <span v-if="rendah(f.confidence)" class="rounded-full bg-white px-2.5 py-1 text-xs font-semibold">Keyakinan rendah {{ keyakinan(f.confidence) }}</span>
            <b v-else>{{ keyakinan(f.confidence) }}</b>
          </div>
        </section>

        <section v-if="inv.comparison" class="flex flex-col gap-3 rounded-3xl border border-line bg-white p-6">
          <div class="flex items-baseline justify-between"><h2 class="font-head text-lg font-extrabold">Perbandingan 3 arah</h2><span class="text-[13px] text-muted">Toleransi harga: {{ String(inv.comparison.tolerance_pct).replace('.', ',') }}%</span></div>
          <ComparisonTable :lines="inv.comparison.lines" :totals="inv.comparison.totals" :tolerance="inv.comparison.tolerance_pct" />
        </section>

        <section v-if="inv.duplicate" class="flex flex-col gap-2 rounded-3xl border border-violet-300 bg-violet-50 p-6">
          <h2 class="font-head text-lg font-extrabold text-violet-950">Duplikat</h2>
          <p class="text-sm">Invoice ini cocok dengan <RouterLink :to="`/invoice/${inv.duplicate.original_invoice_id}`" class="font-bold text-brand underline">{{ inv.duplicate.original_invoice_number }}</RouterLink> ({{ rupiah(inv.duplicate.original_total_amount) }}) pada nomor, nominal, dan vendor.</p>
        </section>

        <section v-if="inv.tax_check" class="flex flex-col gap-1 rounded-3xl border border-line bg-white p-6">
          <div class="flex items-baseline justify-between"><h2 class="font-head text-lg font-extrabold">Cek faktur pajak</h2><span class="text-[13px] text-muted">Data contoh, bukan validasi langsung ke DJP</span></div>
          <div v-for="t in inv.tax_check.items" :key="t.key" class="flex items-center justify-between gap-3 border-b border-line py-3 text-sm last:border-0">
            <b>{{ t.label }}</b><span class="flex-1 text-right text-muted">{{ t.detail }}</span>
            <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="t.result === 'PASS' ? 'bg-brand-tint text-brand-dark' : t.result === 'FAIL' ? 'bg-red-100 text-red-900' : 'bg-slate-200 text-slate-700'">{{ t.result === 'PASS' ? 'Lulus' : t.result === 'FAIL' ? 'Gagal' : 'N/A' }}</span>
          </div>
        </section>

        <section v-if="inv.investigation && inv.investigation.steps.length" class="rounded-3xl border border-line bg-white p-6">
          <InvestigationTimeline :steps="inv.investigation.steps" :iterations="inv.investigation.iterations" :max="inv.investigation.max_iterations" />
        </section>

        <section v-if="inv.finding" class="flex flex-col gap-4 rounded-3xl border border-line bg-white p-6">
          <div class="flex items-baseline justify-between"><h2 class="font-head text-lg font-extrabold">Temuan dan rekomendasi</h2><span class="text-[13px] text-muted">Keyakinan Aura <b class="text-ink">{{ keyakinan(inv.finding.confidence) }}</b></span></div>
          <p class="leading-relaxed">{{ inv.finding.summary }}</p>
          <div class="flex flex-col gap-2">
            <div v-for="l in inv.finding.labels" :key="l.text" class="flex items-center gap-2.5 text-sm">
              <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="l.type === 'FACT' ? 'bg-brand-tint text-brand-dark' : 'bg-amber-100 text-amber-900'">{{ l.type === 'FACT' ? 'Fakta' : 'Dugaan' }}</span>{{ l.text }}
            </div>
          </div>
          <div class="rounded-2xl bg-brand-light px-5 py-4">
            <div class="text-xs font-bold tracking-wide text-brand-dark">REKOMENDASI AURA</div>
            <div class="mt-1 text-base font-bold">{{ inv.finding.recommendation }}</div>
          </div>
          <div>
            <div class="mb-1 text-sm font-bold">Bukti</div>
            <div v-for="e in inv.finding.evidence" :key="e.source_ref + e.quote" class="flex items-start gap-3 border-b border-line py-3 text-sm last:border-0">
              <span class="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">{{ BUKTI[e.source_type] }}</span>
              <div class="flex-1"><div>&ldquo;{{ e.quote }}&rdquo;</div><div class="text-[13px] text-muted">{{ e.source_ref }}, Halaman {{ e.page }}</div></div>
            </div>
          </div>
        </section>

        <DecisionBox v-if="inv.processing_status === 'DONE'" :inv="inv" @updated="inv = $event" />

        <section class="flex flex-col gap-1 rounded-3xl border border-line bg-white p-6">
          <h2 class="mb-1 font-head text-lg font-extrabold">Riwayat keputusan</h2>
          <div v-for="d in inv.decisions" :key="d.id" class="flex items-start gap-3 border-b border-line py-3 text-sm last:border-0">
            <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="d.actor.type === 'AGENT' ? 'bg-brand-tint text-brand-dark' : 'bg-slate-200 text-slate-700'">{{ d.actor.type === 'AGENT' ? 'Aura' : d.actor.name }}</span>
            <div class="flex-1"><div class="font-semibold">{{ d.action }}</div><div class="text-[13px] text-muted">{{ d.reason }}</div></div>
            <span class="text-[13px] text-muted">{{ waktuWib(d.created_at) }}</span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>