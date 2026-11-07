# Panduan Tim AI: Agent Invoice Reconciliation

Dokumen ini menjelaskan **apa yang harus dibuat tim AI**, **apa yang sudah disediakan BE**, dan **cara keduanya bertemu**. Baca dari atas ke bawah sekali, lalu pakai bagian 4 sampai 7 sebagai acuan kerja.

Berkas pendamping:

| Berkas | Isi |
|---|---|
| `docs/api/agent-contract.yaml` | Kontrak `POST /process` (OpenAPI). **Ini yang harus dipenuhi agent.** |
| `docs/ai/evaluasi-label.csv` | Templat tabel label untuk evaluasi 50 invoice. |
| `docs/ai/examples/` | Contoh request dan response untuk tiap kondisi. Pakai sebagai target keluaran dan sebagai data uji. |
| `backend/db/schema.sql` | Struktur seluruh tabel database. |
| `backend/db/agent-readonly.sql` | Membuat user database baca-saja untuk agent. |
| `backend/src/seed/master-data.ts` | Data master sintetis (vendor, barang, PO, GRN). |
| `backend/src/processing/stub/scenarios.json` | Hasil contoh yang dikembalikan agent tiruan BE saat ini. |

---

## 1. Tujuan dan batas tugas agent

Agent menerima **satu berkas invoice** (PDF atau gambar), membandingkannya dengan **PO** dan **GRN** di database, menyelidiki bila ada selisih, lalu mengembalikan **hasil analisis berbukti**. Manusia yang memutuskan setuju atau tolak.

Batas yang tidak boleh dilanggar (ini juga inti klaim proyek):

1. Agent **tidak pernah menyetujui atau menolak** invoice. Hasilnya hanya `verdict`, bukti, dan rekomendasi.
2. Agent **tidak menulis ke database**. Agent hanya membaca. BE yang menyimpan hasilnya.
3. Angka (total, selisih, toleransi) **dihitung kode**, bukan ditebak LLM.
4. Setiap temuan punya **bukti**: kutipan asli dan halamannya, bukan karangan.

## 2. Gambaran arsitektur

```
 Pengguna → FE (Vue) → BE (NestJS) ──POST /process──▶ AGENT ──▶ LLM (Gemini)
                          │                             │
                          └──── PostgreSQL ◀── baca saja (user agent_ro)
```

| Tugas | BE | Agent |
|---|---|---|
| Login, peran, hak akses | ✔ | |
| Terima unggahan, validasi tipe/ukuran, tolak berkas ganda (hash) | ✔ | |
| Antrean, status QUEUED / PROCESSING / DONE / FAILED | ✔ | |
| Tombol Setujui / Tolak / Eskalasi, audit log | ✔ | |
| **Ekstraksi isi invoice** | | ✔ |
| **Cek duplikat, cek faktur pajak** | | ✔ |
| **Pencocokan 3 arah (PO, GRN, invoice)** | | ✔ |
| **Investigasi selisih (hipotesis, tool, bukti)** | | ✔ |
| **Verdict, keyakinan, temuan, rekomendasi** | | ✔ |
| Menyimpan hasil agent ke database | ✔ | |

**Penting:** kunci API LLM hanya ada di sisi agent (variabel lingkungan agent). BE tidak memanggil LLM dan tidak perlu kunci itu.

## 3. Kontrak `POST /process` (ringkas)

Rincian lengkap ada di `docs/api/agent-contract.yaml`.

**Request** (JSON dari BE): `invoice_id`, `file_name`, `content_type`, `file_base64` (isi berkas), `settings` (`price_tolerance_pct`, `confidence_threshold`, `max_iterations`). Contoh: `examples/request.json`.

**Response 200**: `invoice` (kolom ringkas), `verdict`, `confidence`, `difference_amount`, `iterations`, `review_reason`, lalu `extraction`, `comparison`, `tax_check`, `duplicate`, `investigation`, `finding`. Contoh per kondisi: `examples/response_*.json`.

**Response 422 / 500**: `{"error": {"code", "message"}}`. `message` berbahasa Indonesia dan **langsung ditampilkan ke pengguna**, jadi tulis yang ramah dan tanpa detail teknis. Contoh: `examples/error_422_berkas_tidak_terbaca.json`.

Aturan teknis:

- **Waktu:** BE menunggu maksimal 120 detik. Targetkan di bawah 60 detik per invoice. BE menjalankan paling banyak 3 invoice bersamaan.
- **Verdict yang sah bukan error.** EXCEPTION, DUPLICATE, dan NEEDS_REVIEW dikembalikan dengan HTTP 200. Gunakan 422 hanya bila berkas benar-benar tidak bisa dibaca atau bukan invoice.
- **Bagian yang tidak relevan bernilai `null`**, bukan dihilangkan (misalnya `duplicate` pada invoice non-duplikat).
- `GET /health` mengembalikan `{"status":"ok"}`.
- **Jangan buka port agent ke internet.** Cukup dapat dijangkau BE dalam jaringan yang sama (siapa pun yang bisa memanggil `/process` menghabiskan kuota LLM kalian).

## 4. Urutan kerja agent per invoice

```
1 Ekstraksi ─▶ 2 Cek duplikat ─▶ 3 Cek faktur pajak ─▶ 4 Pencocokan 3 arah
                    │                                          │
              DUPLICATE (selesai)               semua cocok ──▶ CLEAN (selesai)
                                                ada selisih ──▶ 5 Investigasi (maks 3 iterasi)
                                                                        │
                                                         6 Temuan + bukti + keyakinan
                                                         ≥ ambang → EXCEPTION, < ambang → NEEDS_REVIEW
```

1. **Ekstraksi** (LLM multimodal). Baca vendor, nomor invoice, nomor PO, tanggal, total, dan baris barang (nama, jumlah, harga satuan). Setiap field punya `confidence`. Bila gagal, ulangi maksimal 2 kali. Bila tetap gagal, kembalikan **422**.
2. **Cek duplikat** (kode, baca tabel `invoices`). Duplikat bila **nomor invoice + vendor** sama dengan invoice lain, atau **vendor + total + tanggal** sama. Bila duplikat: `verdict = DUPLICATE`, `iterations = 0`, `comparison = null`, isi `duplicate` dengan data invoice aslinya. Selesai.
3. **Cek faktur pajak** (sintetis, tidak memvalidasi ke sistem pajak sungguhan). Minimal: NPWP di invoice sama dengan `vendors.npwp`, dan PPN sama dengan 11% dari dasar pengenaan pajak. Nomor seri faktur boleh `NA` bila tidak diimplementasikan. Hasil `PASS`, `FAIL`, atau `NA`. **Cek ini bersifat informasi** dan tidak mengubah verdict kecuali `FAIL` Anda jadikan bahan temuan.
4. **Pencocokan 3 arah per baris** (kode, bukan LLM). Lihat bagian 5.
5. **Investigasi** hanya bila ada selisih di luar toleransi. Loop hipotesis dan tool, maksimal `max_iterations` (3). Lihat bagian 6.
6. **Temuan**: ringkasan, rekomendasi, bukti, label FACT/HYPOTHESIS, dan `confidence`.

## 5. Aturan perhitungan (harus persis, supaya angka konsisten dengan BE dan FE)

Semua uang adalah **bilangan bulat Rupiah**.

**Per baris** (cocokkan baris invoice dengan baris PO lewat nama barang atau SKU):

| Jenis selisih (`diffs[].type`) | `expected` | `actual` | Dianggap selisih bila |
|---|---|---|---|
| `PRICE` | harga satuan di **PO** | harga satuan di invoice | `|actual − expected| / expected × 100 > price_tolerance_pct` |
| `QUANTITY` | jumlah **diterima di GRN** | jumlah di invoice | `actual > expected` (invoice menagih lebih dari yang diterima) |
| `ITEM` | `0` | nilai baris invoice (jumlah × harga) | baris invoice **tidak ada di PO** |

- `delta = actual − expected`, `delta_pct = delta / expected × 100` dibulatkan 1 desimal (`ITEM` tanpa `delta_pct`).
- `within_tolerance` = `true` bila selisihnya masih di dalam toleransi. Baris dengan semua `diffs` di dalam toleransi berstatus `MATCH`, sisanya `MISMATCH`.
- Jumlah invoice **lebih sedikit** dari GRN bukan selisih yang menandai `MISMATCH` (invoice menagih lebih sedikit dari yang diterima, biasanya tidak merugikan). Cukup catat bila perlu.

**Total (`comparison.totals`):**

```
po_total              = Σ (jumlah PO × harga PO)
grn_total_at_po_price = Σ (jumlah diterima GRN × harga PO)
invoice_total         = Σ (jumlah invoice × harga invoice)    ← sama dengan total di invoice
difference            = invoice_total − grn_total_at_po_price
```

`difference_amount` pada response sama dengan `totals.difference`. Contoh: PO-0012, invoice menagih Rp 7.775.000, seharusnya Rp 7.135.000 (barang yang diterima dengan harga PO), selisih **Rp 640.000**. Cek hitungan ini dengan `examples/response_2_...json`.

**Kasus khusus (semuanya NEEDS_REVIEW dengan `review_reason` yang jelas, `comparison = null` bila memang tidak bisa dihitung):**

| Kondisi | `review_reason` (contoh) |
|---|---|
| Nomor PO tidak ditemukan di master | `PO PO-9999 tidak ditemukan di data master` |
| Vendor tidak ditemukan atau tidak cocok dengan PO | `Vendor pada invoice tidak cocok dengan PO` |
| Field penting terbaca dengan keyakinan rendah (< 0,7) | `Keyakinan rendah (0,52)` |
| Investigasi habis tanpa kesimpulan | `Percobaan investigasi habis` |

Contoh PO tidak ditemukan: `examples/response_5_needs_review_po_tidak_ditemukan.json`.

## 6. Investigasi: tool, iterasi, bukti

LLM boleh **mengajukan hipotesis dan memilih tool**. Hasil tool selalu dari database (kode), bukan dari LLM. Tiap iterasi dicatat sebagai satu `steps[]`: `hypothesis`, `tool`, `tool_args_summary`, `result_summary`, `duration_ms`.

| Tool | Masukan | Sumber data | Gunanya |
|---|---|---|---|
| `lookup_po_detail` | `po_number` | `purchase_orders`, `po_lines`, `items` | Lihat baris dan harga PO |
| `cek_grn_status` | `po_number` | `goods_receipts`, `grn_lines` | Lihat barang yang benar-benar diterima |
| `cari_invoice_duplikat` | `vendor_id`, `total_amount` atau `invoice_number` | `invoices` (kolom terbatas) | Cari tagihan serupa |
| `tarik_kontrak_vendor` | `vendor_id`, topik | `vendors.contract_text` | Cari klausul harga atau pengiriman |

- `iterations` = jumlah iterasi yang dipakai (0 sampai 3). `max_iterations` berasal dari `settings`.
- **Berhenti lebih awal** bila hipotesis sudah terbukti atau terbantah.

**Bukti (`finding.evidence[]`):** `source_type` (`PO`, `GRN`, `CONTRACT`, `INVOICE`), `source_ref` (nomor dokumen), `page`, dan `quote`. Aturan:

- `quote` harus **kutipan nyata** dari sumbernya (teks invoice, baris PO/GRN, atau `contract_text`), bukan kalimat buatan LLM.
- Setiap klaim di `summary` harus punya setidaknya satu bukti.
- `labels[]` memisahkan **FACT** (terbukti dari data) dan **HYPOTHESIS** (dugaan). Jangan menulis dugaan sebagai fakta.

## 7. Verdict dan keyakinan

| Kondisi | `verdict` | `iterations` | `confidence` |
|---|---|---|---|
| Duplikat | `DUPLICATE` | 0 | keyakinan atas kecocokan duplikat |
| Semua baris cocok dalam toleransi | `CLEAN` | 0 | keyakinan ekstraksi (jangan 1.0 bila ada field samar) |
| Ada selisih, keyakinan temuan **≥ `confidence_threshold`** | `EXCEPTION` | 1 sampai 3 | keyakinan atas temuan |
| Ada selisih, keyakinan **< `confidence_threshold`** | `NEEDS_REVIEW` | 1 sampai 3 | keyakinan atas temuan |
| Kasus khusus (bagian 5) | `NEEDS_REVIEW` | 0 sampai 3 | sesuai |

- `confidence` mengukur **seberapa yakin kita pada verdict**, bukan besar selisih. Saran sederhana: ambil yang terkecil antara rata-rata keyakinan ekstraksi pada field kunci dan keyakinan dukungan bukti.
- **BE ikut menjaga:** jika agent mengirim `EXCEPTION` dengan keyakinan di bawah ambang, BE otomatis mengubahnya menjadi `NEEDS_REVIEW`. Tetap hitung dengan benar di agent supaya `review_reason` yang tampil akurat.
- Verdict di luar empat nilai di atas, atau `confidence` di luar 0 sampai 1, membuat BE menandai invoice `FAILED` ("Respons agent tidak valid").

## 8. Pembagian peran LLM dan kode

Ini yang membedakan agent dari sekadar "ChatGPT yang ditempel":

| LLM (Gemini) | Kode deterministik |
|---|---|
| Membaca PDF/foto dan mengekstrak field | Cek duplikat |
| Mengajukan hipotesis dan memilih tool | Semua hitungan: selisih, total, persen, toleransi |
| Menulis ringkasan dan rekomendasi bahasa Indonesia | Pemanggilan tool dan pengambilan data dari database |
| | Penentuan verdict dari ambang keyakinan |
| | Pagar: maksimal 3 iterasi, validasi bentuk keluaran |

Validasi keluaran LLM dengan skema (misalnya pydantic) sebelum dipakai. Bila LLM mengembalikan format salah, ulangi sekali, lalu turunkan ke NEEDS_REVIEW atau 422.

## 9. Akses database (baca saja)

1. Setelah BE pernah dijalankan (tabel sudah ada), jalankan `backend/db/agent-readonly.sql` sebagai superuser. Ganti kata sandinya.
2. Agent terhubung dengan user `agent_ro`. Simpan URL koneksi di variabel lingkungan agent (misalnya `AGENT_DB_URL`).
3. Hak yang dimiliki `agent_ro`: `SELECT` pada `vendors`, `items`, `purchase_orders`, `po_lines`, `goods_receipts`, `grn_lines`, dan **hanya kolom ini** dari `invoices`: `id, invoice_number, vendor_id, vendor_name, po_number, invoice_date, total_amount, file_hash, processing_status, verdict, created_at`. Kolom lain ditolak database.

Catatan cek duplikat:

- Kecualikan invoice yang sedang diproses: `WHERE id <> :invoice_id AND invoice_number IS NOT NULL`.
- **Batasan yang diketahui:** BE baru menyimpan nomor invoice setelah agent selesai. Dua duplikat yang diproses **bersamaan dalam satu batch** bisa tidak saling terdeteksi. Duplikat terhadap batch yang sudah selesai terdeteksi normal. Untuk demo, pastikan contoh duplikat berada di batch yang berbeda, atau diproses berurutan.

## 10. Keamanan

- Repo **publik**. Jangan masukkan kunci API, kata sandi database, atau URL koneksi ke repo. Simpan di `.env` (sudah di `.gitignore`) dan tulis nama variabelnya di `.env.example`. Kunci yang pernah masuk riwayat git dianggap bocor dan harus dibuat ulang.
- Hanya **data sintetis**. Jangan memakai invoice atau PO perusahaan nyata.
- Jangan mencatat isi berkas atau kunci di log.
- Kunci yang dipakai harus **resmi dan stabil** sampai masa penilaian selesai. Hindari ketergantungan pada proxy lokal di laptop (server deploy tidak dapat menjangkaunya).

## 11. Deploy (VM)

Usulan topologi paling sederhana: **satu VM, satu `docker compose`**, berisi `db`, `api` (BE), `agent`, dan satu reverse proxy untuk HTTPS.

```
internet ──HTTPS──▶ proxy (Caddy) ──▶ api :3000 ──▶ agent :8000 (jaringan dalam, tidak dibuka)
                                           └────▶ db :5432   (jaringan dalam, tidak dibuka)
```

Kenapa semuanya di satu VM:

- Agent butuh membaca database. Dengan satu VM, database **tidak perlu dibuka ke internet**.
- Tidak ada latensi atau masalah firewall antar layanan.

Hal yang sering terlewat:

- **HTTPS wajib** bila FE di-deploy di Vercel/Netlify/Cloudflare Pages (https). Browser memblokir panggilan dari halaman https ke API `http://IP:3000` (mixed content). Pakai nama domain atau subdomain, lalu Caddy mengurus sertifikat otomatis.
- Variabel lingkungan agent: kunci LLM, `AGENT_DB_URL`. Variabel BE: `AGENT_MODE=http`, `AGENT_URL=http://agent:8000`, `DATABASE_URL`, `JWT_SECRET`, `DEMO_PASSWORD`, `UPLOAD_DIR` (dipasang ke volume Docker agar berkas tidak hilang).
- Volume untuk data Postgres dan folder unggahan. Tanpa volume, redeploy menghapus data.
- Pastikan VM tidak mati atau tertidur selama masa penilaian, dan catat tanggal kedaluwarsa paket sewa.

## 12. Evaluasi (bahan proposal dan demo)

Siapkan **50 invoice sintetis berlabel** dan ukur hasilnya. Angka nyata mengalahkan klaim.

| Kategori | Jumlah usulan | Contoh |
|---|---|---|
| CLEAN | 25 | Semua cocok |
| EXCEPTION | 15 | Harga naik, jumlah lebih, kombinasi, di atas dan di dalam toleransi |
| DUPLICATE | 4 | Nomor sama, atau total + tanggal sama |
| NEEDS_REVIEW | 6 | PO tidak ada, foto buram, baris di luar PO |

Format label (`docs/ai/evaluasi-label.csv` (templat berisi 5 baris contoh; hapus dan ganti dengan 50 baris nyata)): `file_name,verdict_benar,po_number,selisih_benar,catatan`.

Metrik yang dilaporkan: **akurasi verdict**, **recall EXCEPTION** (berapa dari yang seharusnya EXCEPTION ditangkap), **alarm palsu** (CLEAN yang dituduh EXCEPTION), **rata-rata waktu proses**, dan **persen temuan dengan bukti yang valid**.

> **Butuh data master tambahan.** Seed BE saat ini hanya punya 4 PO (`PO-0008`, `0012`, `0015`, `0019`). Untuk 50 invoice dibutuhkan sekitar 15 sampai 20 PO beserta GRN. Kirim daftar PO/GRN tambahan ke BE (format sama dengan `backend/src/seed/master-data.ts`) atau minta BE membuatkannya.

## 13. Cara menguji tanpa menunggu BE

1. Jalankan agent lokal dan kirim `examples/request.json` (dengan `file_base64` berisi PDF asli) ke `POST /process`.
2. Bandingkan keluaran dengan `examples/response_*.json`. Bentuk harus sama (periksa dengan skema di `agent-contract.yaml`).
3. Bila BE sudah jalan lokal: set `AGENT_MODE=http` dan `AGENT_URL=http://localhost:8000` di `backend/.env`, lalu panggil `POST /demo/sample-batch` (login sebagai Staf). Invoice akan muncul di FE dengan hasil dari agent.
4. Nama berkas di batch contoh: `demo_clean_*`, `demo_exception_*`, `demo_review_*`, `demo_gagal_*`, `demo_duplicate_*`. Itu hanya penanda untuk agent tiruan BE; agent asli menganalisis isi berkas.

## 14. Urutan kerja yang disarankan

Prioritas, dari yang paling menentukan nilai:

| Tahap | Hasil | Selesai bila |
|---|---|---|
| M1 | `/process` hidup, mengembalikan hasil **valid kontrak** untuk satu invoice | BE `AGENT_MODE=http` menampilkan hasilnya di FE |
| M2 | Ekstraksi nyata dengan Gemini + pencocokan 3 arah (kode) | Invoice CLEAN dan EXCEPTION sederhana benar |
| M3 | Cek duplikat + kasus khusus (PO tidak ada, foto buram → 422) | Kelima contoh response bisa direproduksi |
| M4 | Investigasi dengan tool + bukti | `investigation` dan `finding.evidence` terisi dari data nyata |
| M5 | Evaluasi 50 invoice | Tabel angka untuk proposal |
| M6 | Deploy VM, HTTPS, uji dari luar | Juri dapat mencoba dari internet |

Bila waktu mepet, **M1 sampai M3 + M5 + M6** lebih berharga daripada M4 yang tanggung. Investigasi boleh disederhanakan (1 sampai 2 iterasi dengan tool paling relevan) selama bukti tetap berasal dari data nyata.

## 15. Daftar periksa sebelum menyerahkan

- [ ] Semua 5 contoh response bisa direproduksi dari invoice yang setara
- [ ] Respons lolos validasi `agent-contract.yaml`
- [ ] Waktu proses rata-rata di bawah 60 detik
- [ ] Tidak ada kunci/kata sandi di repo (cek juga riwayat commit)
- [ ] `.env.example` mencantumkan semua variabel agent
- [ ] Agent tidak mengubah database (hanya user `agent_ro`)
- [ ] Port agent tidak terbuka ke internet
- [ ] Angka evaluasi tercatat dan bisa diulang dengan satu perintah
- [ ] README agent menjelaskan cara menjalankan dan menguji

## 16. Butir terbuka

| # | Butir | Usulan |
|---|---|---|
| 1 | Layanan terpisah (FastAPI) atau modul di dalam BE | Layanan terpisah (diasumsikan seluruh dokumen ini) |
| 2 | Data master tambahan untuk evaluasi | Tim AI kirim daftar PO/GRN, BE memasukkan ke seed |
| 3 | Cek nomor seri faktur pajak | `NA` dulu; tambah bila ada waktu |
| 4 | Duplikat dalam satu batch yang diproses bersamaan | Terima sebagai batasan, atau BE menambah cek setelah-selesai |
| 5 | Siapa yang meng-host | Satu VM berisi seluruh sistem (bagian 11) |
