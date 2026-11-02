# Aturan Pakai API (untuk FE dan AI)

Pendamping `openapi.yaml`. Bila ada yang bertentangan, `openapi.yaml` yang berlaku, lalu kabari BE agar dokumen ini diperbarui.

## 1. Alamat dan akun demo

| Hal | Nilai |
|---|---|
| Base URL lokal | `http://localhost:3000/api` |
| Base URL server demo | Diberikan BE saat server siap. Sampai itu, pakai server tiruan (bagian 12) |
| Dokumentasi interaktif | `<base-url>/docs` (Swagger UI), tersedia saat server siap |

Akun demo (data sintetis). Kata sandi dikirim BE lewat pesan pribadi, jangan ditulis di repositori.

| Peran | Email | Kata sandi |
|---|---|---|
| Staf Finance | `staf@demo.id` | (lewat pesan pribadi) |
| Verifikator | `verif@demo.id` | (lewat pesan pribadi) |
| Admin | `admin@demo.id` | (lewat pesan pribadi) |

## 2. Autentikasi

1. `POST /auth/login` mengembalikan `access_token`.
2. Semua permintaan lain memakai header `Authorization: Bearer <access_token>`.
3. Token berlaku 8 jam (`expires_in` dalam detik). Tidak ada refresh token.
4. Bila menerima `401 UNAUTHORIZED`, hapus token dan arahkan ke halaman Login.
5. Bila menerima `403 FORBIDDEN`, tampilkan halaman 403. Jangan menebak hak akses di FE.

## 3. Format umum

- JSON, nama field `snake_case`.
- **Uang**: bilangan bulat Rupiah, misalnya `7775000`. Format tampilan `Rp 7.775.000` dibuat FE.
- **Tanggal dan waktu**: ISO 8601 UTC (`2026-10-31T01:14:00Z`). Tanggal saja: `2026-10-28`. FE menampilkan WIB.
- **Keyakinan (confidence)**: 0 sampai 1. Tampilkan `0,86`. Jangan diubah jadi persen.
- **Persentase** seperti `tolerance_pct` dan `delta_pct` sudah dalam satuan persen (`0.5` berarti 0,5%).
- Bagian yang tidak relevan bernilai `null` (bukan hilang). Sembunyikan bagian itu di UI.

## 4. Paginasi

Query `page` (mulai 1) dan `page_size` (default 20, maksimal 100). Respons:

```json
{ "data": [ ... ], "meta": { "page": 1, "page_size": 20, "total": 7, "total_pages": 1 } }
```

## 5. Format error

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Alasan wajib diisi.", "details": [ { "field": "reason", "message": "Alasan wajib diisi." } ] } }
```

`message` berbahasa Indonesia dan aman ditampilkan. Logika di FE memakai `code`.

| HTTP | code | Arti |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input tidak valid. `details` menunjuk field. |
| 401 | `UNAUTHORIZED` | Token hilang atau kedaluwarsa. |
| 401 | `INVALID_CREDENTIALS` | Email atau sandi salah. |
| 403 | `FORBIDDEN` | Peran tidak berwenang. |
| 404 | `NOT_FOUND` | Data tidak ada. |
| 409 | `INVALID_TRANSITION` | Status invoice tidak mengizinkan aksi (misalnya sudah diputuskan). |
| 409 | `DUPLICATE_FILE` | Berkas yang sama sudah pernah diunggah. |

## 6. Enum (nilai harus persis)

| Nama | Nilai |
|---|---|
| `role` | `STAF_FINANCE`, `VERIFIKATOR`, `ADMIN` |
| `processing_status` | `QUEUED`, `PROCESSING`, `DONE`, `FAILED` |
| `verdict` | `CLEAN`, `EXCEPTION`, `DUPLICATE`, `NEEDS_REVIEW` (null sebelum `DONE`) |
| `decision_status` | `PENDING`, `ESCALATED`, `APPROVED`, `REJECTED` |
| `action` (keputusan) | `APPROVE`, `REJECT`, `ESCALATE` |
| `line.status` | `MATCH`, `MISMATCH` |
| `diff.type` | `PRICE`, `QUANTITY`, `ITEM` |
| `tax_check.result` | `PASS`, `FAIL`, `NA` |
| `evidence.source_type` | `PO`, `GRN`, `CONTRACT`, `INVOICE` |
| `master type` | `vendors`, `items`, `purchase-orders`, `goods-receipts` |

Label tampilan (Antre, Diproses, Selesai, Gagal, Bersih, Pengecualian, Duplikat, Perlu tinjauan, Menunggu, Dieskalasi, Disetujui, Ditolak) dipetakan di FE. Jangan mengirim label berbahasa Indonesia ke server.

## 7. Tiga status terpisah

Satu invoice membawa tiga status. Jangan digabung di FE.

1. `processing_status`: sedang apa agent terhadap invoice ini.
2. `verdict`: hasil analisis agent. Baru terisi saat `DONE`.
3. `decision_status`: keputusan manusia.

Contoh: `DONE` + `EXCEPTION` + `PENDING` berarti agent selesai, menemukan pengecualian, menunggu Staf.

## 8. Tombol aksi: ikuti `allowed_actions`

Setiap invoice (di daftar dan di rincian) membawa `allowed_actions` yang sudah dihitung server untuk pengguna yang sedang login.

- Tampilkan tombol hanya untuk aksi di dalam array.
- Array kosong berarti baca-saja.
- Tetap tangani `403` dan `409` dari `POST /invoices/{id}/decision`, karena status bisa berubah di antara dua pengambilan data.
- `reason` wajib, minimal 3 karakter. Validasi di FE untuk kenyamanan, server tetap memeriksa.
- Setelah sukses, server mengembalikan rincian invoice terbaru. Pakai itu untuk menyegarkan layar.

## 9. Polling status

Tidak ada WebSocket atau SSE. Selama ada invoice `QUEUED` atau `PROCESSING` pada layar:

- Ulangi `GET /invoices?batch_id=...` tiap 2 sampai 3 detik.
- Hentikan polling bila tidak ada lagi yang `QUEUED` atau `PROCESSING`, atau saat pengguna meninggalkan layar.
- Pada Kartu keputusan yang masih `PROCESSING`, ulangi `GET /invoices/{id}` dengan jeda yang sama. Bagian `investigation.steps` bertambah seiring iterasi (`iteration` 1 sampai 3).
- Untuk Dasbor, ulangi `GET /dashboard/summary`.

## 10. Unggah berkas

`POST /batches` dengan `multipart/form-data`: field `files` (banyak berkas), `name` (opsional).

- Hanya invoice: PDF, JPG, PNG. PO dan GRN tidak diunggah dari sini.
- Batas awal: 50 berkas per batch dan 10 MB per berkas. FE memvalidasi lebih dulu untuk kenyamanan, server tetap memeriksa dan mengembalikan `TOO_LARGE` bila melebihi.
- Respons `201` memuat `accepted` dan `rejected` (alasan `DUPLICATE_FILE`, `UNSUPPORTED_TYPE`, `TOO_LARGE`). Tampilkan keduanya ke pengguna.
- Setelah sukses, arahkan ke daftar invoice untuk batch itu dan mulai polling.

## 11. Menampilkan berkas asli invoice

`GET /invoices/{id}/file` butuh header Authorization, jadi tag `<img src>` atau `<iframe src>` langsung tidak bisa. Ambil sebagai blob lalu buat object URL:

```js
const res = await api.get(`/invoices/${id}/file`, { responseType: 'blob' })
const url = URL.createObjectURL(res.data)   // pakai url di penampil, lalu URL.revokeObjectURL(url) saat selesai
```

## 12. Data tiruan untuk FE

`mock-data.json` memuat contoh respons per kondisi: Antre, Diproses (iterasi 1), CLEAN, EXCEPTION, DUPLICATE, NEEDS_REVIEW, ESCALATED, FAILED, dan invoice yang sudah ditolak. Ada juga contoh untuk Pengguna, Pengaturan, Audit log, Data master, dan Laporan. Bentuknya sama dengan kontrak, jadi saat BE siap FE hanya mengganti sumber data.

Dua cara memakainya:
- **Server tiruan otomatis dari kontrak**: `npx @stoplight/prism-cli mock docs/api/openapi.yaml -p 4010`, lalu set `VITE_API_BASE_URL=http://localhost:4010`. Respons diambil dari contoh di `openapi.yaml`.
- **Memakai `mock-data.json` langsung** lewat MSW atau Mockoon, bila FE ingin mengatur respons per kondisi sendiri.

## 13. Aturan perubahan kontrak

1. Perubahan pada `openapi.yaml` lewat BE. FE dan AI yang butuh perubahan menulis ke BE lebih dulu.
2. Menambah field opsional boleh tanpa pemberitahuan khusus. Mengubah nama, tipe, atau menghapus field harus dikabarkan ke FE dan AI sebelum digabung.
3. Setiap perubahan dicatat di bagian bawah dokumen ini.

## 14. Butir terbuka (perlu diputuskan tim)

| # | Butir | Usulan BE |
|---|---|---|
| 1 | Batas unggah | 50 berkas dan 10 MB (sudah dipakai di kontrak; ubah bila tim sepakat lain) |
| 2 | Siapa boleh Retry invoice FAILED | Staf Finance dan Admin |
| 3 | Admin boleh ubah toleransi saat batch berjalan | Boleh, berlaku mulai batch berikutnya |
| 4 | Admin boleh melihat PDF invoice | Boleh |
| 5 | Pakai 3 peran atau 2 peran | 3 peran (Verifikator dipertahankan) |
| 6 | Cek duplikat sebelum atau sesudah pencocokan | Sebelum |
| 7 | Agent mengirim hasil langsung atau lewat webhook | Langsung (respons `POST /process`) |

## Catatan perubahan

- v1.0.0: versi pertama untuk FE. Kelompok layar pendukung (Pengguna, Pengaturan, Audit, Data master) dilengkapi: kolom data master per jenis, format CSV impor, daftar jenis aksi audit, dan contoh datanya.
