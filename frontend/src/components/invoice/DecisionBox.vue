<script setup lang="ts">
import { computed, ref } from 'vue'
import { postDecision } from '@/api/invoices'
import { pesanError } from '@/api/client'
import type { Action } from '@/types'
import type { InvoiceDetail } from '@/types/detail'
import { waktuWib } from '@/utils/format'

const props = defineProps<{ inv: InvoiceDetail }>()
const emit = defineEmits<{ updated: [InvoiceDetail] }>()

const alasan = ref('')
const dialog = ref<Action | null>(null)
const kirim = ref(false)
const galat = ref('')

const LABEL: Record<Action, string> = { APPROVE: 'Setujui', REJECT: 'Tolak', ESCALATE: 'Eskalasi ke Verifikator' }
const CLS: Record<Action, string> = {
  APPROVE: 'bg-brand text-white border-brand',
  REJECT: 'bg-white text-danger border-danger',
  ESCALATE: 'bg-white text-brand border-brand',
}

const terakhir = computed(() => [...props.inv.decisions].reverse().find((d) => d.actor.type !== 'AGENT'))

function buka(a: Action) {
  if (alasan.value.trim().length < 3) {
    galat.value = 'Alasan wajib diisi, minimal 3 karakter.'
    return
  }
  galat.value = ''
  dialog.value = a
}

async function konfirmasi() {
  if (!dialog.value) return
  kirim.value = true
  try {
    emit('updated', await postDecision(props.inv.id, dialog.value, alasan.value.trim()))
    alasan.value = ''
  } catch (e) {
    galat.value = pesanError(e, 'Keputusan gagal disimpan.')
  } finally {
    dialog.value = null
    kirim.value = false
  }
}
</script>

<template>
  <section v-if="inv.allowed_actions.length" class="flex flex-col gap-4 rounded-3xl border-2 border-brand bg-white p-6">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="font-head text-lg font-extrabold">Keputusan Anda</h2>
      <span class="text-[13px] text-muted">Aura hanya merekomendasikan. Anda yang memutuskan.</span>
    </div>
    <label class="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-700">
      Alasan (wajib, minimal 3 karakter)
      <textarea v-model="alasan" rows="4" placeholder="Tuliskan alasan keputusan Anda" class="rounded-2xl border-[1.5px] border-slate-300 px-3.5 py-3 text-sm font-normal text-ink" />
    </label>
    <p v-if="galat" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }}</p>
    <div class="flex flex-wrap gap-3">
      <button v-for="a in inv.allowed_actions" :key="a" type="button" class="min-h-12 rounded-full border-[1.5px] px-7 font-semibold" :class="CLS[a]" @click="buka(a)">{{ LABEL[a] }}</button>
    </div>
    <p class="text-[13px] text-muted">Setiap tombol meminta konfirmasi dan keputusan tidak dapat diubah. Setujui hanya berarti invoice boleh diteruskan ke proses pembayaran.</p>

    <div v-if="dialog" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div class="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-white p-7 shadow-2xl">
        <h3 class="font-head text-xl font-extrabold">Konfirmasi: {{ LABEL[dialog] }}</h3>
        <div class="text-sm">Invoice <b>{{ inv.invoice_number }}</b></div>
        <div class="rounded-xl bg-slate-50 px-4 py-3 text-sm">{{ alasan }}</div>
        <div class="flex justify-end gap-3">
          <button type="button" class="min-h-11 rounded-full border-[1.5px] border-brand px-6 font-semibold text-brand" :disabled="kirim" @click="dialog = null">Batal</button>
          <button type="button" class="min-h-11 rounded-full bg-brand px-6 font-semibold text-white disabled:opacity-60" :disabled="kirim" @click="konfirmasi">{{ kirim ? 'Menyimpan...' : 'Ya, lanjutkan' }}</button>
        </div>
      </div>
    </div>
  </section>

  <section v-else class="flex flex-col gap-3 rounded-3xl border border-line bg-white p-6">
    <h2 class="font-head text-lg font-extrabold">Ringkasan keputusan</h2>
    <template v-if="terakhir">
      <div class="text-sm"><span class="text-muted">Diputuskan oleh</span> <b>{{ terakhir.actor.name }}</b> · {{ waktuWib(terakhir.created_at) }}</div>
      <div class="rounded-xl bg-slate-50 px-4 py-3 text-sm">{{ terakhir.reason }}</div>
    </template>
    <p v-else class="text-sm text-muted">Tidak ada tindakan keputusan untuk peran Anda pada invoice ini. Kartu bersifat baca-saja.</p>
  </section>
</template>