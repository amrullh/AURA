<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { AxiosError } from 'axios'
import { getMaster, importMaster, type ImportResult, type MasterTable } from '@/api/admin'
import { pesanError } from '@/api/client'

const TAB = [
  { t: 'vendors', label: 'Vendor', petunjuk: 'Nama atau NPWP' },
  { t: 'items', label: 'Item', petunjuk: 'Nama atau SKU' },
  { t: 'purchase-orders', label: 'PO', petunjuk: 'Nomor PO atau vendor' },
  { t: 'goods-receipts', label: 'GRN', petunjuk: 'Nomor GRN atau PO' },
]
const aktif = ref('vendors')
const tabAktif = computed(() => TAB.find((t) => t.t === aktif.value) ?? { t: 'vendors', label: 'Vendor', petunjuk: 'Nama atau NPWP' })
const tabel = ref<MasterTable | null>(null)
const memuat = ref(true)
const galat = ref('')
const cari = ref('')

const input = ref<HTMLInputElement | null>(null)
const berkas = ref<File | null>(null)
const hasil = ref<ImportResult | null>(null)
const sibuk = ref(false)
const galatImpor = ref('')
const info = ref('')

async function muat() {
  memuat.value = true
  try {
    tabel.value = await getMaster(aktif.value)
    galat.value = ''
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat data master.')
  } finally {
    memuat.value = false
  }
}
onMounted(muat)
watch(aktif, () => {
  cari.value = ''
  batal()
  info.value = ''
  muat()
})

const baris = computed(() => {
  const d = tabel.value?.data ?? []
  const k = cari.value.toLowerCase()
  return k ? d.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(k))) : d
})
const kosongPenting = computed(() => !memuat.value && !galat.value && tabel.value?.data.length === 0 && ['purchase-orders', 'goods-receipts'].includes(aktif.value))
const angka = (key: string) => (tabel.value?.data ?? []).some((r) => typeof r[key] === 'number')

function pesanImpor(e: unknown) {
  if ((e as AxiosError).response?.status === 501) return 'Impor CSV belum tersedia di server saat ini.'
  return pesanError(e, 'Berkas tidak dapat diproses.')
}
async function pilih(e: Event) {
  const el = e.target as HTMLInputElement
  const f = el.files?.[0]
  el.value = ''
  if (!f) return
  berkas.value = f
  hasil.value = null
  galatImpor.value = ''
  info.value = ''
  sibuk.value = true
  try {
    hasil.value = await importMaster(aktif.value, f, true)
  } catch (err) {
    galatImpor.value = pesanImpor(err)
    berkas.value = null
  } finally {
    sibuk.value = false
  }
}
async function impor() {
  if (!berkas.value) return
  sibuk.value = true
  galatImpor.value = ''
  try {
    const r = await importMaster(aktif.value, berkas.value, false)
    info.value = `Impor selesai: ${r.valid_rows} baris disimpan.`
    berkas.value = null
    hasil.value = null
    await muat()
  } catch (err) {
    galatImpor.value = pesanImpor(err)
  } finally {
    sibuk.value = false
  }
}
function batal() {
  berkas.value = null
  hasil.value = null
  galatImpor.value = ''
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-head text-3xl font-extrabold tracking-tight">Data master</h1>
      <button type="button" class="btn btn-primary" :disabled="sibuk" @click="input?.click()">Impor CSV</button>
      <input ref="input" type="file" accept=".csv,text/csv" class="hidden" @change="pilih" />
    </header>

    <div class="flex items-center gap-3.5 rounded-2xl bg-brand-light px-5 py-4">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand font-head text-sm font-extrabold text-white">A</div>
      <p class="text-sm leading-relaxed text-slate-700">Aura mencocokkan invoice dengan data di sini. Tanpa data PO dan GRN, Aura tidak dapat mencocokkan dan semua invoice jatuh ke NEEDS_REVIEW.</p>
    </div>

    <p v-if="info" role="status" class="rounded-xl bg-brand-light px-4 py-3 text-sm text-brand-dark">{{ info }}</p>

    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex gap-2">
        <button v-for="t in TAB" :key="t.t" type="button" class="inline-flex min-h-10 cursor-pointer items-center rounded-full px-5 text-sm font-semibold transition duration-150 active:scale-95" :class="aktif === t.t ? 'bg-brand text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-brand hover:text-brand'" @click="aktif = t.t">{{ t.label }}</button>
      </div>
      <label class="flex w-full max-w-xs flex-col gap-1 text-xs font-semibold text-muted">Cari {{ tabAktif.label.toLowerCase() }}
        <input v-model="cari" :placeholder="tabAktif.petunjuk" class="h-11 rounded-xl border-[1.5px] border-slate-300 bg-white px-3.5 text-sm font-normal text-ink" />
      </label>
    </div>

    <p v-if="kosongPenting" role="alert" class="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900"><b>Tabel ini kosong.</b> Aura tidak dapat mencocokkan invoice tanpa data PO dan GRN.</p>
    <p v-if="galat" role="alert" class="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }} <button class="font-bold underline" @click="muat">Coba lagi</button></p>

    <div v-if="tabel" class="overflow-x-auto rounded-2xl border border-line bg-white">
      <table class="w-full min-w-[720px] border-collapse whitespace-nowrap text-sm">
        <thead><tr class="bg-brand-light text-left text-xs text-muted"><th v-for="c in tabel.columns" :key="c.key" class="px-3 py-2" :class="angka(c.key) && 'text-right'">{{ c.label }}</th></tr></thead>
        <tbody>
          <tr v-if="memuat"><td :colspan="tabel.columns.length || 1" class="px-3 py-10 text-center text-muted">Memuat...</td></tr>
          <tr v-else-if="!baris.length"><td :colspan="tabel.columns.length || 1" class="px-3 py-10 text-center text-muted">Belum ada data.</td></tr>
          <tr v-for="(r, i) in baris" :key="i" class="border-t border-line">
            <td v-for="c in tabel.columns" :key="c.key" class="px-3 py-3" :class="[angka(c.key) && 'text-right', c.key === 'id' && 'text-slate-500', c.key === 'name' && 'font-bold']">
              <span v-if="typeof r[c.key] === 'boolean'" class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="r[c.key] ? 'bg-brand-tint text-brand-dark' : 'bg-slate-200 text-slate-700'">{{ r[c.key] ? 'Ya' : 'Tidak' }}</span>
              <template v-else-if="typeof r[c.key] === 'number' && /price|amount/.test(c.key)">{{ (r[c.key] as number).toLocaleString('id-ID') }}</template>
              <template v-else>{{ r[c.key] ?? '-' }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="galatImpor" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galatImpor }}</p>

    <section v-if="berkas && (hasil || sibuk)" class="flex flex-col gap-4 rounded-3xl border border-line bg-white p-6" aria-label="Pratinjau impor CSV">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="font-head text-lg font-extrabold">Pratinjau impor CSV</h2>
        <span class="text-[13px] text-muted"><i>{{ berkas.name }}</i>, tab <b class="text-ink">{{ tabAktif.label }}</b></span>
      </div>

      <p v-if="!hasil" class="text-sm text-muted">Memeriksa berkas...</p>
      <template v-else>
        <div class="flex flex-wrap gap-3">
          <span class="rounded-full bg-brand-tint px-3.5 py-1.5 text-[13px] font-semibold text-brand-dark"><b>{{ hasil.valid_rows }}</b> baris valid</span>
          <span class="rounded-full bg-red-100 px-3.5 py-1.5 text-[13px] font-semibold text-red-900"><b>{{ hasil.invalid_rows }}</b> baris bermasalah</span>
        </div>

        <div v-if="hasil.preview?.length && tabel" class="overflow-x-auto rounded-xl border border-line">
          <table class="w-full min-w-[640px] border-collapse whitespace-nowrap text-sm">
            <thead><tr class="bg-brand-light text-left text-xs text-muted"><th v-for="c in tabel.columns" :key="c.key" class="px-3 py-2" :class="angka(c.key) && 'text-right'">{{ c.label }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in hasil.preview" :key="i" class="border-t border-line">
                <td v-for="c in tabel.columns" :key="c.key" class="px-3 py-3" :class="[angka(c.key) && 'text-right', c.key === 'id' && 'text-slate-500', c.key === 'name' && 'font-bold']">
                  <span v-if="typeof r[c.key] === 'boolean'" class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="r[c.key] ? 'bg-brand-tint text-brand-dark' : 'bg-slate-200 text-slate-700'">{{ r[c.key] ? 'Ya' : 'Tidak' }}</span>
                  <template v-else>{{ r[c.key] ?? '-' }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="hasil.errors?.length" class="flex flex-col gap-1 rounded-xl bg-red-50 px-4 py-3.5">
          <div class="text-[13px] font-bold text-red-900">Baris bermasalah (tidak ikut diimpor)</div>
          <div v-for="e in hasil.errors" :key="e.row" class="text-sm text-red-900">Baris {{ e.row }}: {{ e.reason }}</div>
        </div>

        <div class="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" class="btn btn-primary" :disabled="sibuk || hasil.valid_rows === 0" @click="impor">Impor sekarang ({{ hasil.valid_rows }} baris)</button>
          <button type="button" class="btn btn-outline" :disabled="sibuk" @click="batal">Batal</button>
          <span class="ml-auto text-[13px] text-muted">Impor tercatat di Jejak audit.</span>
        </div>
      </template>
    </section>
  </section>
</template>