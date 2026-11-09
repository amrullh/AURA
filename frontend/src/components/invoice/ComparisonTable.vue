<script setup lang="ts">
import type { CompLine, Totals } from '@/types/detail'
import { rupiah } from '@/utils/format'

defineProps<{ lines: CompLine[]; totals: Totals; tolerance: number }>()

const koma = (n: number) => String(n).replace('.', ',')
const adaDiff = (l: CompLine, t: string) => l.diffs.some((d) => d.type === t)

function teksSelisih(l: CompLine, tol: number) {
  return l.diffs.map((d) => {
    if (d.type === 'PRICE') return `Harga ${d.delta > 0 ? '+' : ''}${rupiah(d.delta)} (${d.delta > 0 ? '+' : ''}${koma(d.delta_pct ?? 0)}%)${d.within_tolerance ? '' : `, di atas toleransi ${koma(tol)}%`}`
    if (d.type === 'QUANTITY') return `Jumlah ${d.delta > 0 ? '+' : ''}${d.delta}, ditagih lebih dari yang diterima`
    return `Item tidak ada di PO dan GRN, +${rupiah(d.delta)}`
  })
}
</script>

<template>
  <div class="overflow-x-auto rounded-2xl border border-line">
    <table class="w-full min-w-[760px] border-collapse text-sm">
      <thead>
        <tr class="bg-brand-light text-left text-xs text-muted">
          <th class="px-3.5 py-3">Item</th><th class="px-3.5 py-3">PO (jumlah × harga)</th>
          <th class="px-3.5 py-3">GRN (diterima)</th><th class="px-3.5 py-3">Invoice (jumlah × harga)</th>
          <th class="px-3.5 py-3">Selisih</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in lines" :key="l.line_no" class="border-t border-line align-top">
          <td class="px-3.5 py-3.5 font-semibold">{{ l.item_name }}</td>
          <td class="px-3.5 py-3.5">
            <span v-if="l.po">{{ l.po.quantity }} × {{ l.po.unit_price.toLocaleString('id-ID') }}</span>
            <span v-else class="text-slate-400">Tidak ada</span>
          </td>
          <td class="px-3.5 py-3.5" :class="adaDiff(l, 'QUANTITY') && 'bg-amber-100 font-bold text-amber-900'">
            <span v-if="l.grn">{{ l.grn.quantity_received }}</span>
            <span v-else class="text-slate-400">Tidak ada</span>
          </td>
          <td class="px-3.5 py-3.5" :class="l.status === 'MISMATCH' && 'bg-amber-100 font-bold text-amber-900'">
            <span v-if="l.invoice">{{ l.invoice.quantity }} × {{ l.invoice.unit_price.toLocaleString('id-ID') }}</span>
          </td>
          <td class="px-3.5 py-3.5">
            <span v-if="l.status === 'MATCH'" class="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-semibold text-brand-dark">Cocok</span>
            <div v-for="t in teksSelisih(l, tolerance)" :key="t" class="text-[13px] text-amber-900">{{ t }}</div>
          </td>
        </tr>
        <tr class="border-t border-line bg-slate-50 font-bold">
          <td class="px-3.5 py-3.5">Total</td>
          <td class="px-3.5 py-3.5">{{ rupiah(totals.po_total) }}</td>
          <td class="px-3.5 py-3.5">{{ rupiah(totals.grn_total_at_po_price) }}<div class="text-xs font-normal text-muted">menurut harga PO</div></td>
          <td class="px-3.5 py-3.5">{{ rupiah(totals.invoice_total) }}</td>
          <td class="px-3.5 py-3.5" :class="totals.difference > 0 ? 'text-red-900' : 'text-lime-900'">Selisih {{ rupiah(totals.difference) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>