<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getAudit, getSettings, putSettings, type AuditRow, type Settings } from '@/api/admin'
import { pesanError } from '@/api/client'
import { waktuWib } from '@/utils/format'

const awal = ref<Settings | null>(null)
const tol = ref('')
const amb = ref('')
const man = ref('')
const riwayat = ref<AuditRow[]>([])
const galat = ref('')
const sukses = ref('')
const simpan = ref(false)

const tampil = (n: number) => String(n).replace('.', ',')
const angka = (s: string) => Number(s.trim().replace(',', '.'))

function isi(s: Settings) {
  awal.value = s
  tol.value = tampil(s.price_tolerance_pct)
  amb.value = tampil(s.confidence_threshold)
  man.value = tampil(s.manual_minutes_per_invoice)
}
onMounted(async () => {
  try {
    isi(await getSettings())
    riwayat.value = (await getAudit()).data.filter((x) => x.action === 'SETTINGS_UPDATED')
  } catch (e) {
    galat.value = pesanError(e, 'Gagal memuat pengaturan.')
  }
})

async function kirim() {
  galat.value = ''
  sukses.value = ''
  const t = angka(tol.value), a = angka(amb.value), mm = angka(man.value)
  if (Number.isNaN(t) || t < 0 || t > 100) return (galat.value = 'Toleransi harga harus berupa angka antara 0 dan 100.')
  if (Number.isNaN(a) || a < 0 || a > 1) return (galat.value = 'Ambang keyakinan harus berupa angka antara 0 dan 1.')
  if (Number.isNaN(mm) || mm <= 0) return (galat.value = 'Waktu manual harus berupa angka lebih dari 0.')
  simpan.value = true
  try {
    isi(await putSettings({ price_tolerance_pct: t, confidence_threshold: a, manual_minutes_per_invoice: mm }))
    sukses.value = 'Pengaturan disimpan. Nilai baru berlaku untuk batch berikutnya.'
  } catch (e) {
    galat.value = pesanError(e, 'Pengaturan gagal disimpan.')
  } finally {
    simpan.value = false
  }
}
const batal = () => awal.value && isi(awal.value)
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="flex flex-col gap-1.5">
      <h1 class="font-head text-3xl font-extrabold tracking-tight">Pengaturan</h1>
      <p class="text-sm text-muted">Aturan ini dipakai Aura saat memeriksa invoice. Nilai baru berlaku untuk batch berikutnya, bukan invoice yang sedang diproses.</p>
    </header>

    <div class="flex flex-col items-start gap-6 lg:flex-row">
      <section class="flex w-full flex-[2] flex-col gap-5 rounded-3xl border border-line bg-white p-7">
        <h2 class="font-head text-lg font-extrabold">Aturan Aura</h2>

        <label class="flex flex-col gap-1.5 text-sm font-bold">Toleransi harga (persen)
          <input v-model="tol" inputmode="decimal" class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 font-normal" />
          <span class="text-[13px] font-normal text-muted">Selisih harga di bawah nilai ini dianggap cocok. Keputusan numerik memakai aturan tetap, bukan kesimpulan model (G1).</span>
        </label>
        <label class="flex flex-col gap-1.5 text-sm font-bold">Ambang keyakinan
          <input v-model="amb" inputmode="decimal" class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 font-normal" />
          <span class="text-[13px] font-normal text-muted">Rekomendasi Aura di bawah nilai ini dikirim ke Verifikator sebagai NEEDS_REVIEW. Isi antara 0 dan 1.</span>
        </label>
        <div class="flex flex-col gap-1.5 text-sm font-bold">Batas iterasi investigasi
          <div class="flex h-12 items-center justify-between rounded-xl border-[1.5px] border-dashed border-slate-300 bg-slate-50 px-3.5 font-normal"><b>{{ awal?.max_iterations ?? 3 }}</b><span class="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">Baca-saja</span></div>
          <span class="text-[13px] font-normal text-muted">Tidak dapat diubah dari antarmuka. Setelah tiga iterasi Aura wajib meminta peninjauan manusia (G4).</span>
        </div>
        <label class="flex flex-col gap-1.5 text-sm font-bold">Waktu manual per invoice (menit)
          <input v-model="man" inputmode="decimal" class="h-12 rounded-xl border-[1.5px] border-slate-300 px-3.5 font-normal" />
          <span class="text-[13px] font-normal text-muted">Pembanding untuk estimasi penghematan waktu di Laporan dan metrik.</span>
        </label>

        <p v-if="galat" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">{{ galat }}</p>
        <p v-if="sukses" role="status" class="rounded-xl bg-brand-light px-4 py-3 text-sm text-brand-dark">{{ sukses }}</p>

        <div class="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button type="button" :disabled="simpan" class="min-h-12 rounded-full bg-brand px-8 font-semibold text-white disabled:opacity-60" @click="kirim">{{ simpan ? 'Menyimpan...' : 'Simpan' }}</button>
          <button type="button" class="min-h-12 rounded-full border-[1.5px] border-brand px-6 font-semibold text-brand" @click="batal">Batalkan perubahan</button>
          <span v-if="awal" class="ml-auto text-[13px] text-muted">Terakhir diubah oleh {{ awal.updated_by }}, {{ waktuWib(awal.updated_at) }}</span>
        </div>
      </section>

      <aside class="flex w-full flex-1 flex-col gap-6 lg:min-w-[320px]">
        <section class="flex flex-col gap-2.5 rounded-3xl bg-brand-light p-6">
          <div class="flex items-center gap-2.5"><div class="flex size-7 items-center justify-center rounded-full bg-brand font-head text-sm font-extrabold text-white">A</div><b class="text-sm text-brand-dark">Cara Aura memakai aturan ini</b></div>
          <p class="text-[13px] leading-relaxed text-slate-700">Setiap invoice menyimpan nilai aturan yang dipakainya, sehingga hasil lama tetap dapat diaudit walau aturan berubah. Perubahan tercatat di Jejak audit.</p>
        </section>
        <section class="flex flex-col rounded-3xl border border-line bg-white p-6">
          <h2 class="mb-1 font-head text-lg font-extrabold">Riwayat perubahan</h2>
          <div v-for="r in riwayat" :key="r.id" class="flex flex-col gap-1 border-b border-line py-3 last:border-0"><b class="text-sm">{{ r.summary }}</b><span class="text-[13px] text-muted">{{ r.actor.name }}, {{ waktuWib(r.created_at) }}</span></div>
          <p v-if="!riwayat.length" class="py-3 text-sm text-muted">Belum ada perubahan.</p>
        </section>
      </aside>
    </div>
  </section>
</template>