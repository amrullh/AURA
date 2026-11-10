# Panduan serah terima integrasi FE dengan BE

Untuk: tim BE. Dari: FE. Terakhir diperbarui: 9 November 2026.

Batas kumpul lomba: **Selasa, 10 November 2026, 23.59 WIB**. Grand Final: Sabtu, 14 November 2026.

## 1. Ringkasan satu menit

- FE **tidak mengubah kontrak**. Semua pemanggilan mengikuti `docs/api/openapi.yaml` (v1.0.0). Bila ada beda antara FE dan `openapi.yaml`, `openapi.yaml` yang benar dan FE yang diperbaiki.
- Sampai sekarang FE **dikembangkan dan diuji hanya dengan server tiruan** yang membaca `docs/api/mock-data.json` (milik BE). **FE belum pernah dijalankan terhadap BE asli.** Anggaplah pertemuan pertama pasti menemukan beberapa ketidakcocokan kecil.
- Menyambungkan FE ke BE **hanya mengatur `.env`**. Tidak ada kode FE yang perlu diubah BE (bagian 3).
- Yang FE butuhkan dari BE: tiga hal wajib (bagian 9), konfirmasi bentuk respons (bagian 8), dan beberapa definisi metrik.
- Setelah BE menguji, ketidakcocokan dikirim ke FE dengan format di bagian 13. FE yang memperbaiki.

## 2. Pembagian tanggung jawab

| Pihak | Tanggung jawab |
|---|---|
| **FE** | Seluruh antarmuka, server tiruan, penanganan galat dan status di layar, dokumen ini |
| **BE** | Kontrak API, deploy BE ke alamat HTTPS publik, CORS, data dan akun demo, agent tiruan, seluruh aturan keputusan (`allowed_actions`, transisi status, audit) |
| **Tim AI** | Isi hasil analisis (`extraction`, `comparison`, `tax_check`, `duplicate`, `investigation`, `finding`). Lihat `UNTUK_TIM_AI.md` |

Aturan keputusan hanya hidup di BE (`decision.rules.ts`). FE menampilkan apa yang BE putuskan dan tidak menduplikasinya.

## 3. Menyambungkan FE ke BE secara lokal (4 langkah)

1. Jalankan BE (`backend/README.md`), misalnya di `http://localhost:3000`.
2. Di `frontend/`:
   ```bash
   npm install
   cp .env.example .env
   ```
3. Edit `.env`:
   ```
   VITE_API_BASE_URL=/api
   DEV_API_TARGET=http://localhost:3000
   VITE_DEMO_PASSWORD=<sama dengan DEMO_PASSWORD di BE>
   ```
   `DEV_API_TARGET` tanpa `/api` di akhir (FE menambahkannya).
4. `npm run dev`, buka `http://localhost:5173`, masuk lewat tombol akun demo.

Lewat proxy ini browser tidak terkena masalah CORS saat pengembangan.

| Gejala | Kemungkinan penyebab |
|---|---|
| Login gagal "Email atau kata sandi salah" | `VITE_DEMO_PASSWORD` tidak sama dengan `DEMO_PASSWORD` BE |
| Login berhasil, halaman lain gagal dimuat | `DEV_API_TARGET` salah, atau berisi `/api` di akhir |
| Langsung kembali ke Login | Token ditolak (`401`). Periksa `JWT_SECRET` dan jam server |
| Tabel kosong padahal BE berisi data | Bentuk respons berbeda dari kontrak. Lihat tab Network, lalu bagian 13 |

## 4. Deploy produksi (FE di Vercel)

- Root Directory `frontend`. Environment Variables: `VITE_API_BASE_URL=https://<alamat-be>/api` dan `VITE_DEMO_PASSWORD`.
- Di produksi browser memanggil BE **langsung** (tanpa proxy), jadi:
  - BE harus **HTTPS** (halaman HTTPS tidak boleh memanggil HTTP biasa).
  - BE harus mengizinkan origin FE di **CORS**: `http://localhost:5173` dan alamat Vercel. Header: `Authorization`, `Content-Type`. Method: GET, POST, PUT, PATCH, OPTIONS.
- `vercel.json` memuat aturan SPA (semua alamat diarahkan ke `index.html`).
- Alamat Vercel dikirim FE ke BE begitu tersedia.

## 5. Apa yang FE kerjakan di luar kontrak

FE tidak menambah endpoint. Tetapi beberapa angka dan teks **diturunkan di FE** dari respons BE. BE perlu tahu supaya data konsisten.

| Yang tampil | Cara FE menurunkannya |
|---|---|
| Beranda: "N dari M invoice sudah dianalisis" | N = `counts.clean + exception + duplicate + needs_review` dari `latest_batch` |
| Beranda: persen lolos | `counts.clean / total` dikali 100, dibulatkan |
| Beranda: "Antre atau diproses" | `total - completed`. **Mengasumsikan `completed` sudah termasuk yang gagal** |
| Beranda: baris "Selesai" pada Status pemrosesan | sama dengan N di atas |
| Daftar invoice: banner progres | `completed / total` dari batch terakhir (atau `GET /batches/{id}` bila ada `?batch_id=`) |
| Daftar invoice: catatan pemilik di samping PENDING ("Verifikator") | `queue_owner` bila berbeda dari peran pengguna |
| Laporan: kali lebih cepat (Admin) | `manual_minutes_per_invoice * 60 / avg_processing_seconds` |
| Laporan: selisih per vendor diurutkan | FE mengurutkan menurun menurut `difference_total` |
| Jejak audit: kolom Objek | Nomor invoice diambil dari kalimat `summary` (pola `INV-...`), nama batch dari `GET /batches`, nama aktor lengkap dengan peran dari `GET /users`. **Rapuh. Lihat permintaan di bagian 9.** |
| Pengaturan: riwayat perubahan | `GET /audit-logs` disaring di FE untuk `SETTINGS_UPDATED` |
| Sorotan "keyakinan rendah" pada field ekstraksi | `confidence < 0,75` (konstanta di FE, bukan ambang sistem 0,70) |

## 6. Peta halaman ke endpoint

| Halaman | Endpoint |
|---|---|
| Login | `POST /auth/login` |
| Beranda (semua peran) | `GET /dashboard/summary` (diulang tiap 2,5 detik selama batch terakhir `PROCESSING`) |
| Unggah batch (Staf) | `GET /settings`, `POST /batches` (multipart: `files` berulang, `name`), `POST /demo/sample-batch` |
| Daftar invoice | `GET /invoices` (`q`, `batch_id`, `verdict`, `decision_status`, `vendor_id`, `page`, `page_size`), `GET /dashboard/summary`, `GET /batches/{id}` (bila `?batch_id=`), `POST /invoices/{id}/retry` |
| Antrean saya (Staf) | `GET /invoices?queue=mine` (komponen yang sama dengan Daftar invoice) |
| Antrean review dan eskalasi (Verifikator) | `GET /invoices?queue=mine&page_size=50` |
| Kartu keputusan | `GET /invoices/{id}` (diulang selama `QUEUED` atau `PROCESSING`), `GET /invoices/{id}/file` (blob), `POST /invoices/{id}/decision` (`action`, `reason`) |
| Laporan dan metrik | `GET /reports/metrics` (`batch_id`, `from`, `to`), `GET /settings`, `GET /batches` |
| Jejak audit (Admin) | `GET /audit-logs` (`actor_type`, `action`, `from`, `to`, `page`, `page_size`), `GET /users`, `GET /batches` |
| Data master (Admin) | `GET /master/{type}`, `POST /master/{type}/import?dry_run=true\|false` (multipart: `file`) |
| Pengaturan (Admin) | `GET /settings`, `PUT /settings` (3 field), `GET /audit-logs` |
| Pengguna (Admin) | `GET /users`, `POST /users`, `PATCH /users/{id}` (`role` atau `is_active`) |

Tidak dipakai FE: `GET /me`, `POST /demo/reset`.

## 7. Aturan perilaku FE

**Autentikasi.** `Authorization: Bearer <access_token>` pada semua permintaan selain login. Token dan objek `user` disimpan di `localStorage` (`aura_token`, `aura_user`). `401` selain `INVALID_CREDENTIALS` menghapus sesi dan mengarah ke `/login?expired=1`. `403` pada pemuatan rincian invoice mengarah ke halaman 403.

**Galat.** FE menampilkan `error.message` dari BE apa adanya (bahasa Indonesia) dan memakai `error.code` untuk logika. Kode yang dikenal: `INVALID_CREDENTIALS`, `VALIDATION_ERROR`, `FORBIDDEN`, `INVALID_TRANSITION`, `DUPLICATE_FILE`, `EMAIL_TAKEN`, `NOT_IMPLEMENTED` (status 501 pada impor CSV).

**Tombol keputusan.** Hanya untuk aksi di `allowed_actions` pada rincian invoice. FE tetap menangani `403` dan `409` dari `POST .../decision`. Alasan wajib minimal 3 karakter (divalidasi di FE untuk kenyamanan; server tetap pemutus). Setiap keputusan meminta konfirmasi. Setelah sukses, FE mengganti rincian di layar dengan **respons** `POST .../decision`, jadi respons itu harus berbentuk `InvoiceDetail` terbaru.

**Polling.** Tanpa WebSocket atau SSE. Interval 2,5 detik. Berhenti saat tidak ada lagi yang perlu dipantau atau saat pengguna meninggalkan halaman.

**Unggah.** FE memeriksa lebih dulu: hanya PDF, JPG, PNG; maksimal **50 berkas** dan **10 MB** per berkas; nama dan ukuran yang sama ditandai ganda. Hanya berkas valid yang dikirim. FE menampilkan `accepted` dan `rejected` dari respons, dengan alasan `DUPLICATE_FILE`, `UNSUPPORTED_TYPE`, `TOO_LARGE`. Batas di BE tetap yang berlaku.

**Berkas asli invoice.** `GET /invoices/{id}/file` dipanggil sebagai blob dengan header Authorization, lalu dibuat object URL. `file.content_type` menentukan tampilan: `application/pdf` memakai iframe, selain itu `<img>`. FE **mengabaikan `file.url`** dari respons.

**Format.** Uang bilangan bulat Rupiah. Waktu ISO 8601 UTC ditampilkan di zona **Asia/Jakarta** (WIB). Tanggal tanpa waktu (`invoice_date`) ditampilkan apa adanya. Keyakinan 0 sampai 1 tampil dengan koma desimal. Persentase (`tolerance_pct`, `delta_pct`, metrik) sudah dalam satuan persen.

**Label.** Nilai enum dikirim BE dalam bentuk kode; FE yang menerjemahkan ke label Indonesia.

## 8. Asumsi FE yang perlu dikonfirmasi BE

Centang yang sudah dipastikan. Kolom "Dampak" menjelaskan apa yang rusak bila asumsinya salah.

| # | Asumsi | Dampak bila salah |
|---|---|---|
| 1 | Respons login memuat `access_token` dan `user` (`id`, `name`, `email`, `role`, `is_active`, `last_login_at`) | Login gagal atau nama dan peran kosong |
| 2 | `POST /invoices/{id}/decision` membalas `InvoiceDetail` terbaru | Kartu tidak menyegarkan setelah keputusan |
| 3 | `POST /demo/sample-batch` membalas bentuk yang sama dengan `POST /batches` (`batch`, `accepted`, `rejected`). **Belum dipastikan** | Tombol "Muat data contoh" gagal |
| 4 | `POST /invoices/{id}/retry` membalas 2xx, status invoice kembali `QUEUED`, lalu bergerak seperti biasa. Boleh untuk Staf dan Admin | Tombol "Coba ulang" tidak berfungsi |
| 5 | `PUT /settings` membalas objek `Settings` terbaru; FE hanya mengirim `price_tolerance_pct`, `confidence_threshold`, `manual_minutes_per_invoice` | Layar Pengaturan tidak menyegarkan |
| 6 | `POST /users` membalas pengguna baru; duplikat email membalas `409 EMAIL_TAKEN`. `PATCH /users/{id}` membalas pengguna terbaru; mengubah akun sendiri membalas `403` | Tabel pengguna salah |
| 7 | Kolom tabel Data master dibuat dari `columns` pada respons. Nilai boolean tampil Ya atau Tidak; angka pada kolom bernama `price` atau `amount` diberi pemisah ribuan | Kolom salah atau kosong |
| 8 | `POST /master/{type}/import` dengan `dry_run=true` membalas `ImportResult` (`valid_rows`, `invalid_rows`, `preview`, `errors`). Bila belum dikerjakan membalas `501` (FE menampilkan "belum tersedia") | Panel pratinjau impor |
| 9 | Kode aksi audit sesuai enum kontrak (12 nilai). Kode di luar daftar tampil apa adanya | Label audit mentah |
| 10 | `from` dan `to` pada audit dan metrik: FE mengirim `YYYY-MM-DD` dari input tanggal. **Inklusif atau tidak, dan zona waktunya?** | Filter tanggal bergeser satu hari |
| 11 | `GET /dashboard/summary`: `latest_batch.completed` **sudah termasuk** yang gagal (`counts.failed`); verdict `counts` hanya untuk invoice yang sudah dianalisis; `my_queue_count` sesuai peran; Verifikator mendapat `needs_review_count`, `escalated_count`, `decided_today`; Admin mendapat `active_users_by_role` | Angka Beranda tidak menjumlah |
| 12 | `GET /invoices`: `QUEUED` dan `FAILED` punya `invoice_number`, `vendor_name`, `total_amount`, `verdict`, `confidence` bernilai `null`; `PROCESSING` memuat `iteration` 1 sampai 3; `queue_owner` bernilai `STAF_FINANCE`, `VERIFIKATOR`, atau `null` | Baris tampil salah |
| 13 | Filter `q`, `batch_id`, `queue=mine`, `verdict`, `decision_status`, `vendor_id`, `page`, `page_size` dikerjakan **di server**. FE juga menyaring ulang halaman yang dimuat, jadi hasilnya tidak salah, tetapi paginasi bergantung pada server | Filter tidak mengubah jumlah halaman |
| 14 | `GET /invoices/{id}` pada invoice `PROCESSING` menambah `investigation.steps` setiap iterasi (bukan sekaligus di akhir). FE melakukan polling | Penyelidikan Aura tidak terlihat "hidup" saat demo |
| 15 | `processing.error_message` terisi untuk invoice `FAILED` | Pesan kegagalan kosong |
| 16 | `GET /invoices/{id}/file` mengirim byte berkas asli dengan Authorization dan `Content-Type` yang benar, untuk semua peran | Panel Dokumen asli kosong |
| 17 | `GET /settings` boleh dibaca semua peran (kontrak: ya). `GET /users` dan `GET /audit-logs` hanya Admin | Unggah batch dan Jejak audit |
| 18 | Waktu selalu UTC ISO 8601 dengan akhiran `Z` | Jam bergeser |
| 19 | Token berlaku 8 jam, tanpa refresh | Sesi berakhir mendadak |

## 9. Permintaan ke BE

### Wajib (menghalangi demo bila belum ada)

1. **Deploy BE ke alamat HTTPS publik**, lengkap dengan Swagger `/docs`. Kabari alamatnya ke FE.
2. **CORS** untuk `http://localhost:5173` dan alamat Vercel (bagian 4).
3. **Kata sandi akun demo** (`DEMO_PASSWORD`) dan pastikan `staf@demo.id`, `verif@demo.id`, `admin@demo.id` aktif.
4. **Data dan berkas demo**: database sudah terisi seed; `POST /demo/sample-batch` dan `POST /demo/reset` berfungsi; sediakan beberapa berkas invoice contoh yang namanya memicu hasil agent tiruan (`clean`, `exception`, `duplicate`, `review`, `gagal`) untuk video demo.
5. **Server tetap hidup** sampai Grand Final 14 November (bila memakai paket gratis yang tidur, matikan fitur tidur atau bangunkan sebelum rekaman).
6. Konfirmasi tiga bentuk respons: `POST /demo/sample-batch`, `POST /invoices/{id}/retry`, `POST /invoices/{id}/decision`.

### Sangat disarankan

7. **Jejak audit**: tambahkan `object_label` (nomor invoice atau nama batch) dan `actor.role` pada tiap baris, supaya FE tidak menebak dari kalimat `summary`. Tanpa itu, tampilan Objek dan peran aktor bergantung pada pola teks.
8. **Definisi metrik** (`GET /reports/metrics`):
   - `estimated_hours_saved`: total waktu manual (invoice kali menit manual) atau penghematan bersih (dikurangi waktu proses Aura)? Mock memberi 19,7 jam yang sama dengan 118 kali 10 menit, yaitu angka kotor. Bila dipakai di proposal, juri bisa mempertanyakannya.
   - `by_vendor`: semua vendor atau hanya yang teratas? Di mock jumlahnya Rp 7.720.000, sedangkan `difference_caught_total` Rp 18.450.000.
   - `auto_clear_percent`: penyebutnya semua invoice atau hanya yang sudah dianalisis?
   - `estimated_hours_saved` bernilai `null` bila waktu manual kosong (FE menampilkan "-").
9. **Filter server-side pada daftar invoice** (asumsi 13), karena paginasi bergantung padanya.

### Opsional

10. **Impor CSV data master**: FE sudah selesai. Bila BE tidak sempat, beri tahu FE untuk menyembunyikan tombolnya supaya juri tidak menemukan fitur yang gagal.

## 10. Perbedaan server tiruan dan BE asli

| Hal | Server tiruan | BE asli |
|---|---|---|
| Peran | Dari teks email, dibawa dalam token `mock-staf`, `mock-verifikator`, `mock-admin` | JWT sungguhan |
| Keputusan | Tidak disimpan | Disimpan, status berubah, tercatat di audit |
| Daftar invoice | Sama untuk semua peran | Berbeda per peran dan antrean |
| `allowed_actions` | Tetap per contoh data | Dihitung per pengguna |
| Status invoice | Statis (kecuali "Coba ulang", disimulasikan) | Agent tiruan menggerakkan Antre, Diproses, Selesai |
| Unggah | Selalu membalas contoh yang sama | Memproses berkas sungguhan |
| Pengaturan, pengguna, impor Vendor | Disimpan di memori, hilang saat dimulai ulang | Database |
| Metrik per batch | Perkiraan yang diturunkan dari hitungan batch | Nilai sebenarnya |
| Berkas asli invoice | Tidak ada (404) | Berkas yang diunggah |
| Filter dan paginasi | Diabaikan (FE menyaring sendiri) | Dikerjakan server |

Server tiruan juga berguna bagi BE: bandingkan respons BE dengan contoh di `docs/api/mock-data.json` untuk melihat bentuk yang FE harapkan.

## 11. Keterbatasan FE saat ini

1. **Belum diuji dengan BE asli.**
2. Penampil dokumen hanya menampilkan berkas. **Menyorot kutipan bukti dan melompat ke halaman belum ada**, walau bukti (`source_ref`, `page`, `quote`) ditampilkan.
3. Beranda Admin belum memuat panel "Aktivitas terbaru Aura", "Aturan Aura", dan tombol "Atur ulang data demo" yang ada di desain.
4. Kartu keputusan belum punya tombol Sebelumnya dan Berikutnya antar invoice (hanya Kembali).
5. Ambang sorotan field ekstraksi bernilai tetap `0,75` di `InvoiceDetailView.vue` (fungsi `rendah`), tidak mengikuti `confidence_threshold` dari Pengaturan.
6. Setelah login selalu ke Beranda, tidak kembali ke alamat yang tadi dibuka.
7. Tanpa refresh token. Sesi berakhir setelah 8 jam.
8. Antrean Verifikator memuat maksimal 50 baris tanpa paginasi. Data master memuat maksimal 100 baris.
9. Dioptimalkan untuk layar desktop. Layar sempit belum diuji dan navbar belum responsif.
10. Tidak ada tes otomatis.
11. Filter Laporan: bila `batch_id` dipilih, kolom tanggal dinonaktifkan di FE.

## 12. Daftar uji serah terima

Masuk dengan tiap akun demo dan periksa:

- **Staf**
  - Beranda menampilkan angka batch terakhir.
  - Unggah batch: tambahkan 3 berkas termasuk satu `.docx` (harus ditandai tidak didukung), lalu **Proses batch**. Daftar invoice menampilkan batch itu dan statusnya bergerak Antre, Diproses (iterasi 1 sampai 3), Selesai tanpa memuat ulang halaman.
  - Buka invoice EXCEPTION: perbandingan 3 arah, langkah Aura, temuan, bukti, dan Dokumen asli tampil.
  - Tolak dengan alasan dan konfirmasi: status menjadi REJECTED dan tombol hilang.
  - Baris Gagal: **Coba ulang** menggerakkan invoice kembali ke Antre.
  - Laporan dan metrik: pilih satu batch, angka berubah.
- **Verifikator**
  - Antrean berisi NEEDS_REVIEW dan ESCALATED.
  - Kartu hanya punya Setujui dan Tolak. Invoice yang dieskalasi menampilkan nama dan alasan Staf.
- **Admin**
  - Jejak audit memuat keputusan Staf tadi dan entri "Aura (Agent)". Klik satu baris: detail tampil.
  - Pengaturan: ubah toleransi, simpan, tercatat di audit. Unggah batch Staf menampilkan nilai baru.
  - Pengguna: tambah, nonaktifkan, aktifkan. Akun sendiri tidak bisa diubah.
  - Data master: empat tab. Tab PO atau GRN yang kosong menampilkan peringatan.
  - Kartu keputusan baca-saja.
- **Pelanggaran akses**: buka `/audit` sebagai Staf harus menampilkan halaman 403.
- **Sesi**: ubah token menjadi tidak valid (hapus `aura_token` di DevTools lalu muat ulang) harus mengarah ke Login.

## 13. Melaporkan ketidakcocokan ke FE

Kirim:

1. Halaman dan peran.
2. Endpoint dan method.
3. **Respons mentah** dari tab Network browser (F12), bukan hanya tangkapan layar.
4. Yang diharapkan menurut `openapi.yaml`.

Dengan itu FE bisa memperbaiki tanpa menebak.

### Peta file FE bila BE ingin menelusuri sendiri

| Perubahan di kontrak | File FE yang terpengaruh |
|---|---|
| Nama field respons | `src/types/*.ts` dan tampilan di `src/views/*.vue` |
| Alamat atau parameter endpoint | `src/api/invoices.ts`, `dashboard.ts`, `admin.ts` |
| Nilai enum atau label | `src/utils/status.ts`, `src/utils/audit.ts` |
| Penanganan token dan galat | `src/api/client.ts`, `src/stores/auth.ts` |
| Rute dan peran yang boleh | `src/router/index.ts`, `src/layouts/AppLayout.vue` |
| Warna dan gaya tombol | `src/assets/main.css` |
