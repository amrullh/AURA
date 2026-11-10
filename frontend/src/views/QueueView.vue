<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getInvoices } from '@/api/invoices'
import { pesanError } from '@/api/client'
import { usePolling } from '@/composables/usePolling'
import { useAuthStore } from '@/stores/auth'
import InvoiceListView from '@/views/InvoiceListView.vue'
import { keyakinan, rupiah, waktuWib } from '@/utils/format'
import type { InvoiceListItem } from '@/types/invoice'

const auth = useAuthStore()
const isVerif = computed(() => auth.role === 'VERIFIKATOR')
const baris = ref<InvoiceListItem[]>([])
const memuat = ref(true)
const galat = ref('')

const BTN =
  'inline-flex min-h-8 cursor-pointer items-center whitespace-nowrap rounded-full border-[1.5px] border-brand px-3.5 py-1 text-[13px] font-semibold text-brand transition duration-150 hover:bg-brand hover:text-white active:scale-95 active:border-brand-dark active:bg-brand-dark active:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

async function ambil() {
  // Staf memakai InvoiceListView (mode antrean), jadi data khusus ini hanya untuk Verifikator.
  if (!isVerif.value) { memuat.value = false; return }
  try {
    baris.value = (await getInvoices({ queue: 'mine', page_size: 50 })).data
    galat.value = ''
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat antrean.')
  } finally {
    memuat.value = false
  }
}
const { muatUlang } = usePolling(ambil, () => false)

const nReview = computed(() => baris.value.filter((x) => x.verdict === 'NEEDS_REVIEW' && x.decision_status !== 'ESCALATED').length)
const nEskalasi = computed(() => baris.value.filter((x) => x.decision_status === 'ESCALATED').length)

function sumber(x: InvoiceListItem) {
  if (x.decision_status === 'ESCALATED') return { label: 'Eskalasi dari Staf', cls: 'bg-blue-100 text-blue-900' }
  if (x.processing_status === 'FAILED') return { label: 'Gagal diproses', cls: 'bg-red-100 text-red-900' }
  return { label: 'Ragu: keyakinan rendah', cls: 'bg-pink-100 text-pink-900' }
}
</script>

<template>
  <InvoiceListView v-if="!isVerif" antrean />

  <section v-else class="flex flex-col gap-6">
    <h1 class="font-head text-3xl font-extrabold tracking-tight">Antrean review dan eskalasi</h1>

    <div class="flex flex-col gap-3.5">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="flex min-h-[170px] flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-white py-8"><span class="font-head text-6xl font-extrabold">{{ nReview }}</span><span class="rounded-full bg-pink-100 px-4 py-1.5 text-sm font-semibold text-pink-900">NEEDS_REVIEW</span><span class="text-sm text-muted">Diragukan Aura atau gagal diproses</span></div>
        <div class="flex min-h-[170px] flex-col items-center justify-center gap-3 rounded-3xl border border-line bg-white py-8"><span class="font-head text-6xl font-extrabold">{{ nEskalasi }}</span><span class="rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-900">ESCALATED</span><span class="text-sm text-muted">Dieskalasi oleh Staf Finance</span></div>
      </div>
      <div class="rounded-2xl bg-brand-light px-5 py-3 text-sm text-brand-dark">Keputusan Verifikator bersifat final dan tidak dapat diubah.</div>
    </div>

    <p v-if="galat" role="alert" class="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }} <button class="font-bold underline" @click="muatUlang">Coba lagi</button></p>

    <div class="overflow-x-auto rounded-2xl border border-line bg-white">
      <table class="w-full min-w-[900px] border-collapse whitespace-nowrap text-sm">
        <thead>
          <tr class="bg-brand-light text-left text-xs text-muted">
            <th class="px-3 py-2">No. invoice</th><th class="px-3 py-2">Vendor</th><th class="px-3 py-2 text-right">Total (Rp)</th>
            <th class="px-3 py-2">Sumber</th><th class="px-3 py-2">Keyakinan</th><th class="px-3 py-2">Masuk antrean</th><th class="w-px px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="memuat"><td colspan="7" class="px-3 py-10 text-center text-muted">Memuat...</td></tr>
          <tr v-else-if="!baris.length"><td colspan="7" class="px-3 py-10 text-center text-muted">Antrean kosong. Semua invoice sudah diputuskan.</td></tr>
          <tr v-for="x in baris" :key="x.id + x.decision_status" class="border-t border-line">
            <td class="px-3 py-2 font-bold">{{ x.invoice_number ?? '(belum terbaca)' }}</td>
            <td class="px-3 py-2">{{ x.vendor_name ?? '-' }}</td>
            <td class="px-3 py-2 text-right">{{ x.total_amount != null ? rupiah(x.total_amount).replace('Rp ', '') : '-' }}</td>
            <td class="px-3 py-2"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="sumber(x).cls">{{ sumber(x).label }}</span></td>
            <td class="px-3 py-2">{{ x.confidence != null ? keyakinan(x.confidence) : '-' }}</td>
            <td class="px-3 py-2"><i>{{ x.processed_at ? waktuWib(x.processed_at) : '-' }}</i></td>
            <td class="px-3 py-2 text-right"><RouterLink :to="`/invoice/${x.id}`" :class="BTN">Buka</RouterLink></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>