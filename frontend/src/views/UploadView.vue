<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getSettings, sampleBatch, uploadBatch, type Settings, type UploadResult } from '@/api/admin'
import { pesanError } from '@/api/client'
import { waktuWib } from '@/utils/format'

type Status = 'valid' | 'ganda' | 'tipe' | 'besar'
interface Item { file: File; status: Status }

const MAX_FILES = 50
const MAX_MB = 10
const router = useRouter()
const items = ref<Item[]>([])
const nama = ref('')
const seret = ref(false)
const kirim = ref(false)
const persen = ref(0)
const galat = ref('')
const hasil = ref<UploadResult | null>(null)
const aturan = ref<Settings | null>(null)
const input = ref<HTMLInputElement | null>(null)

onMounted(async () => { try { aturan.value = await getSettings() } catch { /* aturan hanya informasi */ } })

const LABEL: Record<Status, { t: string; cls: string; ket: string }> = {
  valid: { t: 'Valid', cls: 'bg-brand-tint text-brand-dark', ket: '' },
  ganda: { t: 'Berkas ganda', cls: 'bg-amber-100 text-amber-900', ket: 'Sudah ada di daftar, tidak akan diproses.' },
  tipe: { t: 'Tipe tidak didukung', cls: 'bg-red-100 text-red-900', ket: 'Hanya PDF, JPG, dan PNG yang diterima.' },
  besar: { t: 'Terlalu besar', cls: 'bg-red-100 text-red-900', ket: `Maksimal ${MAX_MB} MB per berkas.` },
}

function periksa(f: File): Status {
  const ok = ['application/pdf', 'image/jpeg', 'image/png'].includes(f.type) || /\.(pdf|jpe?g|png)$/i.test(f.name)
  if (!ok) return 'tipe'
  if (f.size > MAX_MB * 1024 * 1024) return 'besar'
  if (items.value.some((x) => x.file.name === f.name && x.file.size === f.size)) return 'ganda'
  return 'valid'
}
function tambah(daftar: FileList | File[]) {
  for (const f of Array.from(daftar)) items.value.push({ file: f, status: periksa(f) })
  hasil.value = null
}
function lepas(e: DragEvent) { seret.value = false; if (e.dataTransfer) tambah(e.dataTransfer.files) }
function pilih(e: Event) { const el = e.target as HTMLInputElement; if (el.files) tambah(el.files); el.value = '' }
const hapus = (i: number) => items.value.splice(i, 1)
const ukuran = (b: number) => (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'

const valid = computed(() => items.value.filter((x) => x.status === 'valid'))
const lewatBatas = computed(() => valid.value.length > MAX_FILES)

async function proses() {
  galat.value = ''
  kirim.value = true
  persen.value = 0
  try {
    hasil.value = await uploadBatch(valid.value.map((x) => x.file), nama.value.trim(), (p) => (persen.value = p))
    items.value = []
  } catch (e) {
    galat.value = pesanError(e, 'Unggah gagal. Coba lagi.')
  } finally {
    kirim.value = false
  }
}
async function contoh() {
  galat.value = ''
  kirim.value = true
  try { hasil.value = await sampleBatch() } catch (e) { galat.value = pesanError(e, 'Gagal memuat data contoh.') } finally { kirim.value = false }
}
const keDaftar = () => router.push({ path: '/invoice', query: { batch_id: hasil.value?.batch.id } })
const ALASAN: Record<string, string> = { DUPLICATE_FILE: 'Berkas ganda', UNSUPPORTED_TYPE: 'Tipe tidak didukung', TOO_LARGE: 'Terlalu besar' }
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-col gap-1.5">
      <h1 class="font-head text-3xl font-extrabold tracking-tight">Unggah batch</h1>
      <p class="text-sm text-muted">Unggah invoice vendor. Aura membacanya, mencocokkan dengan PO dan GRN yang sudah tersimpan, lalu menyelidiki selisih.</p>
    </header>

    <div v-if="hasil" class="flex flex-col gap-4 rounded-3xl border-2 border-brand bg-white p-7">
      <h2 class="font-head text-xl font-extrabold">Batch diterima: {{ hasil.batch.name }}</h2>
      <p class="text-sm"><b>{{ hasil.accepted.length }}</b> berkas masuk antrean Aura.<span v-if="hasil.rejected.length"> <b>{{ hasil.rejected.length }}</b> berkas ditolak:</span></p>
      <ul v-if="hasil.rejected.length" class="flex flex-col gap-1.5 text-sm">
        <li v-for="r in hasil.rejected" :key="r.file_name" class="flex items-center gap-2.5"><span class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">{{ ALASAN[r.reason] ?? r.reason }}</span>{{ r.file_name }}</li>
      </ul>
      <div class="flex gap-3">
        <button class="min-h-12 rounded-full bg-brand px-7 font-semibold text-white" @click="keDaftar">Lihat daftar invoice</button>
        <button class="min-h-12 rounded-full border-[1.5px] border-brand px-6 font-semibold text-brand" @click="hasil = null">Unggah lagi</button>
      </div>
    </div>

    <div v-else class="flex flex-col items-start gap-6 lg:flex-row">
      <div class="flex min-w-0 flex-[2] flex-col gap-5">
        <div
          class="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-11 text-center"
          :class="seret ? 'border-brand bg-brand-tint' : 'border-teal-300 bg-brand-light'"
          @dragover.prevent="seret = true" @dragleave="seret = false" @drop.prevent="lepas"
        >
          <div class="flex size-14 items-center justify-center rounded-full bg-brand">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></svg>
          </div>
          <div class="font-head text-xl font-extrabold tracking-tight">Seret dan lepas invoice di sini</div>
          <div class="text-[13px] text-muted">atau</div>
          <button type="button" class="min-h-11 rounded-full border-[1.5px] border-brand bg-white px-6 font-semibold text-brand" @click="input?.click()">Pilih berkas</button>
          <input ref="input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" class="hidden" @change="pilih" />
          <div class="text-[13px] text-muted">PDF, JPG, atau PNG. Maksimal {{ MAX_FILES }} berkas per batch dan {{ MAX_MB }} MB per berkas.</div>
        </div>

        <section v-if="items.length" class="flex flex-col rounded-3xl border border-line bg-white p-6">
          <div class="mb-1 flex items-baseline justify-between">
            <h2 class="font-head text-base font-extrabold">Berkas terpilih ({{ items.length }})</h2>
            <span class="text-[13px] text-muted">{{ valid.length }} siap diproses, {{ items.length - valid.length }} tidak ikut diproses</span>
          </div>
          <div v-for="(it, i) in items" :key="i" class="flex items-center gap-3.5 border-b border-line py-3.5 last:border-0">
            <div class="min-w-0 flex-1"><div class="truncate text-sm font-semibold">{{ it.file.name }}</div><div class="text-[13px] text-muted">{{ ukuran(it.file.size) }}<span v-if="LABEL[it.status].ket"> · {{ LABEL[it.status].ket }}</span></div></div>
            <span class="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" :class="LABEL[it.status].cls">{{ LABEL[it.status].t }}</span>
            <button type="button" class="px-3 py-2 text-sm font-semibold text-muted" @click="hapus(i)">Hapus</button>
          </div>
        </section>
        <p v-if="lewatBatas" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">Maksimal {{ MAX_FILES }} berkas per batch. Hapus sebagian berkas.</p>
      </div>

      <aside class="flex w-full flex-1 flex-col gap-5 lg:min-w-[320px]">
        <section class="flex flex-col gap-4 rounded-3xl border border-line bg-white p-6">
          <label class="flex flex-col gap-1.5 text-[13px] font-semibold text-slate-700">Nama batch (opsional)
            <input v-model="nama" placeholder="Contoh: Batch 31 Okt, siang" class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 text-sm font-normal" />
          </label>
          <div v-if="aturan">
            <div class="mb-1 text-[13px] font-semibold text-slate-700">Aturan Aura yang berlaku</div>
            <div class="flex justify-between border-b border-line py-3 text-sm"><span>Toleransi harga</span><b>{{ String(aturan.price_tolerance_pct).replace('.', ',') }}%</b></div>
            <div class="flex justify-between border-b border-line py-3 text-sm"><span>Ambang keyakinan</span><b>{{ aturan.confidence_threshold.toFixed(2).replace('.', ',') }}</b></div>
            <div class="flex justify-between py-3 text-sm"><span>Batas iterasi investigasi</span><b>{{ aturan.max_iterations }}</b></div>
            <div class="text-xs text-muted">Diatur oleh <i>{{ aturan.updated_by }}</i>, <i>{{ waktuWib(aturan.updated_at) }}</i>. Hanya bisa dibaca di sini.</div>
          </div>
        </section>

        <section class="flex flex-col gap-2 rounded-3xl bg-brand-light p-5">
          <div class="flex items-center gap-2.5"><div class="flex size-7 items-center justify-center rounded-full bg-brand font-head text-sm font-extrabold text-white">A</div><b class="text-sm text-brand-dark">Yang dilakukan Aura</b></div>
          <p class="text-[13px] leading-relaxed text-slate-700">Aura memproses tiap invoice di latar belakang dan menyelidiki selisih sampai tiga iterasi. PO dan GRN tidak diunggah di sini karena sudah tersimpan di sistem.</p>
        </section>

        <section class="flex flex-col gap-3 rounded-3xl border border-line bg-white p-6">
          <div v-if="kirim">
            <div class="mb-1.5 flex justify-between text-[13px]"><b>Progres unggah</b><span class="text-muted">{{ persen }}%</span></div>
            <div class="h-2.5 overflow-hidden rounded-full bg-slate-200"><div class="h-full bg-brand" :style="{ width: persen + '%' }" /></div>
          </div>
          <p v-if="galat" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }}</p>
          <button type="button" :disabled="!valid.length || lewatBatas || kirim" class="min-h-12 rounded-full bg-brand font-semibold text-white disabled:opacity-50" @click="proses">{{ kirim ? 'Mengunggah...' : `Proses batch (${valid.length} berkas)` }}</button>
          <button type="button" class="min-h-11 rounded-full border-[1.5px] border-brand font-semibold text-brand" :disabled="kirim" @click="items = []">Batal</button>
          <div class="text-center"><button type="button" class="text-[13px] font-semibold text-brand underline" :disabled="kirim" @click="contoh">Muat data contoh</button><span class="text-[13px] text-muted"> (untuk juri)</span></div>
        </section>
      </aside>
    </div>
  </section>
</template>