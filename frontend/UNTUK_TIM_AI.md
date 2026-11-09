# Untuk tim AI: bagaimana FE menampilkan hasil agent

Dari: FE. Terakhir diperbarui: 9 November 2026.

Dokumen ini **melengkapi** `docs/ai/PANDUAN_TIM_AI.md` dan contoh di `docs/ai/examples/`. Kalau ada beda, panduan BE dan `openapi.yaml` yang berlaku. Dokumen ini hanya menjelaskan **bagaimana hasil agent muncul di layar**, supaya format keluaran agent menghasilkan tampilan yang benar.

## 1. Alur singkat

```
Tim AI (agent)  -->  BE (POST {AGENT_URL}/process)  -->  database  -->  GET /invoices/{id}  -->  FE
```

- **FE tidak memanggil agent.** Semua keluaran agent lewat BE dan tampil di FE dalam bentuk `InvoiceDetail` (`docs/api/openapi.yaml`).
- Kontrak antara BE dan agent masih **draf** (`backend/src/processing/agent.types.ts`). Yang dijelaskan di sini adalah sisi FE dari hasilnya.
- Agent tidak pernah mengubah `decision_status` dan tidak pernah menyetujui pembayaran. Keputusan ada di manusia.

## 2. Yang harus terlihat saat demo

Penilaian lomba paling berat pada **otonomi agent (25%)**, **penalaran dan perencanaan (15%)**, dan **penggunaan tool (15%)**. Ketiganya terlihat di layar hanya bila:

1. **Langkah penyelidikan muncul bertahap.** Saat invoice `PROCESSING`, FE memuat ulang rincian tiap 2,5 detik. Bila BE menulis `investigation.steps` **satu per satu setiap iterasi selesai** (bukan sekaligus di akhir), juri melihat Aura bekerja langkah demi langkah. Mohon agent melaporkan langkah per iterasi.
2. **Setiap temuan punya bukti.** Kutipan dan nomor halaman tampil di bawah rekomendasi.
3. **Agent berhenti dan meminta manusia saat ragu**, bukan menebak.

## 3. Bagian hasil dan batasan tampilannya

Semua teks yang dibaca pengguna **berbahasa Indonesia**, singkat, dan tanpa format markdown (FE menampilkannya sebagai teks biasa).

### 3.1 `extraction.fields[]`

| Field | Catatan tampilan |
|---|---|
| `key` | Pengenal teknis. FE memformat nilai sebagai Rupiah bila `key` mengandung `total` atau `amount` dan nilainya angka |
| `label` | Ditampilkan apa adanya ("Vendor", "No. invoice", "Referensi PO", "Total") |
| `value` | Teks atau angka |
| `confidence` | 0 sampai 1. **FE menandai field dengan `confidence` di bawah 0,75** sebagai "Keyakinan rendah" (kuning). Angka ini tetap di FE dan berbeda dari ambang sistem 0,70 |

### 3.2 `comparison`

- `tolerance_pct` tampil sebagai "Toleransi harga: 0,5%".
- `lines[]`: `po`, `grn`, `invoice` boleh `null` untuk item yang tidak ada di dokumen itu. `status` `MATCH` atau `MISMATCH`.
- `diffs[]` tiap baris:
  - `PRICE`: FE menulis "Harga +Rp 4.000 (+6,9%)" dari `delta` dan `delta_pct`; bila `within_tolerance` bernilai `false` ditambah ", di atas toleransi 0,5%".
  - `QUANTITY`: "Jumlah +2, ditagih lebih dari yang diterima".
  - `ITEM`: "Item tidak ada di PO dan GRN, +Rp ...".
- Sel Invoice diwarnai kuning bila `status` `MISMATCH`; sel GRN diwarnai bila ada `diff` bertipe `QUANTITY`.
- `totals`: `po_total`, `grn_total_at_po_price`, `invoice_total`, `difference`. `difference` lebih dari nol tampil merah.
- **Penjumlahan harus konsisten**: `difference` = `invoice_total - po_total` pada contoh. Bila tidak jelas rumusnya, FE menampilkan angka itu apa adanya.

### 3.3 `investigation`

- `iterations` dan `max_iterations` tampil sebagai "Iterasi 3 dari 3". **Maksimal 3** (pagar G4).
- `steps[]` per langkah:

| Field | Tampilan |
|---|---|
| `step` | Nomor langkah (1, 2, 3) dan "Iterasi n dari 3" |
| `hypothesis` | Ditampilkan miring dengan awalan "Hipotesis:". **Tulis kalimat hipotesis saja**, tanpa kata "Hipotesis" di depannya |
| `tool` | Nama persis sebagai kode: `lookup_po_detail`, `cek_grn_status`, `cari_invoice_duplikat`, `tarik_kontrak_vendor` |
| `tool_args_summary` | Parameter ringkas di samping nama tool (misalnya `PO-0012`, `ven_003, klausul harga`). Pendek |
| `result_summary` | Hasil yang diringkas, 1 kalimat (misalnya "Pasal 4.2 mensyaratkan pemberitahuan tertulis 30 hari; tidak ada pemberitahuan.") |
| `duration_ms` | Bilangan bulat milidetik. FE menampilkan "4,2 detik" |

### 3.4 `finding`

| Field | Tampilan |
|---|---|
| `summary` | Paragraf temuan. 1 sampai 2 kalimat |
| `recommendation` | Kalimat perintah, ditampilkan menonjol dalam kotak "REKOMENDASI AURA". Contoh: "Tolak dan minta vendor menerbitkan koreksi invoice." |
| `confidence` | 0 sampai 1, tampil dengan koma ("0,86") |
| `labels[]` | `type` `FACT` tampil "Fakta" (hijau), `HYPOTHESIS` tampil "Dugaan" (kuning). **Pisahkan dengan jujur**: yang terbukti dokumen adalah Fakta, yang kesimpulan agent adalah Dugaan |
| `evidence[]` | Lihat di bawah |

`evidence[]`:

| Field | Catatan |
|---|---|
| `source_type` | `PO`, `GRN`, `CONTRACT`, `INVOICE`. Tampil sebagai lencana (`CONTRACT` menjadi "KONTRAK") |
| `source_ref` | Nomor dokumen (misalnya `PO-0012`, `GRN-0087`) |
| `page` | Bilangan bulat mulai dari 1 |
| `quote` | **Kutipan persis dari dokumen, tanpa tanda kutip.** FE menambahkan tanda kutip sendiri. Pendek, sebaiknya di bawah sekitar 160 karakter |

Pagar G3: setiap keputusan harus punya bukti. Temuan tanpa `evidence` tampil tanpa bagian bukti.

### 3.5 Bagian lain

- `tax_check.items[]`: `result` `PASS` tampil "Lulus", `FAIL` "Gagal", `NA` "N/A". `detail` pendek. FE selalu menulis "Data contoh, bukan validasi langsung ke DJP" di atas bagian ini.
- `duplicate`: bila terisi, FE menampilkan kotak ungu dengan tautan ke invoice asli (`original_invoice_id`) dan memuat `original_invoice_number` dan `original_total_amount`.
- `review_reason` (untuk `NEEDS_REVIEW`): ditampilkan tepat setelah kalimat tetap "Aura ragu dan tidak mengambil kesimpulan sendiri." Tulis alasannya saja, dengan koma desimal. Contoh: "Keyakinan rendah (0,52)." atau "Percobaan 3 dari 3 habis."
- `processing.error_message` (untuk `FAILED`): pesan kegagalan yang bisa dibaca pengguna.

## 4. Aturan yang ditegakkan BE (agar agent tahu)

- Temuan `EXCEPTION` dengan keyakinan di bawah ambang (bawaan 0,70) otomatis menjadi `NEEDS_REVIEW` di BE, bukan hanya di agent.
- Selisih harga di bawah toleransi (bawaan 0,5%) dianggap cocok lewat aturan eksplisit, bukan kesimpulan model (G1).
- Data pribadi dan nominal di-masking sebelum dikirim ke LLM eksternal (G2).
- Maksimal 3 iterasi investigasi, lalu wajib meminta peninjauan manusia (G4).

## 5. Yang FE hitung dari keluaran agent

| Tampilan | Sumber |
|---|---|
| Beranda: lolos otomatis | `counts.clean` (verdict `CLEAN`) |
| Laporan: selisih tertangkap | `difference_caught_total` dari BE |
| Laporan: waktu rata-rata per invoice | `avg_processing_seconds` dari BE. Target proposal sekitar 40 detik per invoice |

Mohon `verdict` dan `confidence` konsisten dengan isi `finding` (misalnya `CLEAN` tidak disertai selisih pada `comparison`).

## 6. Cara melihat hasil agent di layar

1. Jalankan BE dengan `AGENT_MODE=http` dan `AGENT_URL` mengarah ke agent.
2. Jalankan FE ke BE itu (`frontend/INTEGRASI.md` bagian 3).
3. Masuk sebagai Staf, unggah satu berkas contoh (`docs/ai/examples`), lalu buka invoice yang selesai di **Daftar invoice**. Periksa tiap bagian terhadap bagian 3 di atas.

Bila agent belum siap, BE memakai agent tiruan (`AGENT_MODE=stub`) yang hasilnya sudah dapat dilihat di FE. Nama berkas menentukan hasilnya: `clean`, `exception`, `duplicate`, `review`, atau `gagal`.

## 7. Daftar periksa tim AI

- [ ] Semua teks berbahasa Indonesia, singkat, tanpa markdown.
- [ ] `investigation.steps` ditulis bertahap per iterasi, maksimal 3 langkah.
- [ ] `tool` memakai salah satu dari empat nama tool di atas, persis.
- [ ] `hypothesis` hanya kalimat hipotesis (tanpa awalan "Hipotesis:").
- [ ] `quote` kutipan persis tanpa tanda kutip; `page` bilangan bulat mulai dari 1.
- [ ] `labels` memisahkan `FACT` dan `HYPOTHESIS` dengan jujur.
- [ ] `confidence` 0 sampai 1; `NEEDS_REVIEW` punya `review_reason`.
- [ ] `comparison.totals` konsisten dengan baris-barisnya.
- [ ] Nomor halaman bukti benar-benar ada di dokumen.
