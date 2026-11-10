# Aura Web (Frontend)

Antarmuka web untuk **Aura**, agent AI yang mencocokkan invoice vendor dengan PO dan GRN (pencocokan 3 arah), menyelidiki selisih secara mandiri, dan menyiapkan temuan berbukti. Aura hanya merekomendasikan. **Keputusan selalu di tangan manusia.**

Bagian dari GTNIC 2026, kategori AI Agent. Backend ada di `../backend`, kontrak API di `../docs/api`, panduan tim AI di `../docs/ai`.

Terakhir diperbarui: 9 November 2026.

## Status

| Hal | Keadaan |
|---|---|
| Halaman untuk tiga peran (Staf Finance, Verifikator, Admin) | Sudah dibangun |
| Dijalankan dengan server tiruan (data contoh dari `docs/api/mock-data.json`) | Sudah |
| Dijalankan dengan BE asli | **Belum pernah diuji.** Lihat `INTEGRASI.md` |
| Tes otomatis | Belum ada |

Aplikasi ini **berbicara ke API lewat satu alamat yang diatur di `.env`**. Berpindah dari data tiruan ke BE asli cukup mengubah `.env`, tanpa mengubah kode.

## Teknologi

Vue 3, Vite, TypeScript, Vue Router, Pinia, Tailwind CSS v4, Axios. Font: Plus Jakarta Sans (judul) dan Inter (isi), keduanya lewat `@fontsource-variable`.

`@tanstack/vue-query` ikut terpasang tetapi **tidak dipakai**. Boleh dihapus.

## Peran dan halaman

| Peran | Menu |
|---|---|
| **Staf Finance** | Beranda, Unggah batch, Daftar invoice, Antrean saya, Laporan dan metrik |
| **Verifikator** | Beranda, Antrean review dan eskalasi, Daftar invoice |
| **Admin** | Beranda, Daftar invoice, Laporan dan metrik, Jejak audit, Data master. Di menu profil: Pengaturan, Pengguna |

Halaman lain: **Login**, **Kartu keputusan** (rincian satu invoice, dibuka dari daftar atau antrean), **403**, **404**.

Satu komponen dipakai bersama oleh beberapa peran (Daftar invoice, Antrean saya Staf, Kartu keputusan, Beranda, Laporan). Perbedaan tampilan per peran datang dari **data BE** (terutama `allowed_actions`), bukan dari dugaan peran di FE. Rute dan peran yang boleh membukanya ada di `src/router/index.ts`.

## Menjalankan

Prasyarat: Node.js 20.19 atau lebih baru (disarankan 22 LTS).

```bash
cd frontend
npm install
cp .env.example .env        # lalu isi sesuai mode di bawah
```

### Mode 1: server tiruan (tanpa BE)

Memakai `docs/api/mock-data.json`. Cocok untuk menyusun tampilan.

```bash
npm run mock                # terminal 1, http://localhost:4010
npm run dev                 # terminal 2, http://localhost:5173
```

Isi `.env`:

```
VITE_API_BASE_URL=/api
DEV_API_TARGET=http://localhost:4010
VITE_DEMO_PASSWORD=demo12345
```

Sandi apa pun diterima. Server tiruan menentukan peran dari teks email (`staf@`, `verif@`, `admin@`). Setiap kali `mock/server.mjs` diubah, matikan `npm run mock` (Ctrl+C, jawab `Y`) lalu jalankan lagi.

### Mode 2: BE asli

Jalankan BE (lihat `../backend/README.md`), lalu isi `.env`:

```
VITE_API_BASE_URL=/api
DEV_API_TARGET=http://localhost:3000
VITE_DEMO_PASSWORD=<sama dengan DEMO_PASSWORD di BE>
```

`DEV_API_TARGET` ditulis **tanpa** `/api` di akhir. Mulai ulang `npm run dev` setiap `.env` berubah.

## Variabel lingkungan

| Nama | Fungsi |
|---|---|
| `VITE_API_BASE_URL` | Alamat API yang dipanggil browser. Pengembangan: `/api` (diteruskan Vite). Produksi: alamat BE publik berakhiran `/api`, misalnya `https://be-aura.example.com/api`. |
| `DEV_API_TARGET` | Tujuan proxy saat pengembangan: server tiruan (`http://localhost:4010`) atau BE asli (`http://localhost:3000`). Tidak dipakai di produksi. |
| `VITE_DEMO_PASSWORD` | Mengisi kata sandi otomatis pada tombol akun demo di halaman Login. |

Variabel berawalan `VITE_` ikut terbundel ke browser, jadi jangan menaruh rahasia di sana. Data demo bersifat sintetis. **`.env` tidak boleh di-commit**; yang di-commit hanya `.env.example`.

## Akun demo

`staf@demo.id`, `verif@demo.id`, `admin@demo.id`. Kata sandi sama dengan `DEMO_PASSWORD` di BE (bawaan README BE: `demo12345`, harus diganti sebelum deploy publik).

## Skrip npm

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan (5173) |
| `npm run mock` | Server tiruan tanpa dependensi (4010) |
| `npm run build` | Membangun versi produksi ke `dist/` |
| `npm run preview` | Mencoba hasil build secara lokal |

## Deploy (Vercel)

1. Hubungkan repo, atur **Root Directory** ke `frontend`.
2. Environment Variables: `VITE_API_BASE_URL=https://<alamat-be>/api` dan `VITE_DEMO_PASSWORD`.
3. `vercel.json` sudah memuat aturan SPA, sehingga alamat seperti `/invoice/inv_0412` tidak 404 saat dimuat ulang.
4. BE harus **HTTPS** dan mengizinkan alamat Vercel di CORS (header `Authorization` dan `Content-Type`; method GET, POST, PUT, PATCH, OPTIONS).

## Struktur

```
frontend/
  mock/server.mjs        server tiruan, membaca ../docs/api/mock-data.json
  src/
    api/                 pemanggilan ke BE (client.ts: token, penanganan 401)
    components/
      ui/                StatusBadge
      invoice/           DocumentViewer, ComparisonTable, InvestigationTimeline, DecisionBox
    composables/         usePolling (polling 2,5 detik)
    layouts/             AppLayout (navbar Aura, menu per peran)
    router/              rute dan penjaga peran
    stores/              auth (token, pengguna)
    types/               tipe dari kontrak API (index, invoice, detail)
    utils/               format (rupiah, waktu WIB), status (label dan warna), audit, csv
    views/               satu berkas per halaman
    assets/main.css      token warna, font, dan kelas tombol bersama
  vercel.json
  INTEGRASI.md           panduan serah terima untuk BE
  UNTUK_TIM_AI.md        yang perlu diketahui tim AI tentang tampilan hasil agent
```

## Aturan penting yang dipatuhi FE

- **Tombol keputusan** (Setujui, Tolak, Eskalasi) hanya tampil bila ada di `allowed_actions` dari server. Array kosong berarti kartu baca-saja. FE tidak menebak hak akses.
- **Tiga status invoice dipisah** dan tidak digabung: `processing_status`, `verdict`, `decision_status`.
- **Polling 2,5 detik** (tanpa WebSocket): Beranda selama batch terakhir `PROCESSING`, Daftar invoice selama ada invoice `QUEUED` atau `PROCESSING`, Kartu keputusan selama invoice itu belum selesai.
- **Format**: uang bilangan bulat Rupiah (tampil `Rp 7.775.000`), waktu UTC ditampilkan WIB, keyakinan 0 sampai 1 tampil `0,86`.
- **Sesi**: token di `localStorage` (`aura_token`, `aura_user`), berlaku 8 jam menurut BE, tanpa refresh token. `401` menghapus sesi dan mengarah ke Login; `403` ke halaman 403.
- **Label tampilan** (Antre, Diproses, Selesai, Gagal, dan seterusnya) dipetakan di FE (`src/utils/status.ts`). Server tidak perlu mengirim label.

## Penanda gaya di antarmuka

Angka yang berubah mengikuti data ditampilkan **tebal**, sedangkan nama dan waktu yang berubah (nama batch, jam unggah) ditampilkan *miring*. Teks tetap (label, judul) biasa.

## Batasan yang diketahui

Daftar lengkap dan alasannya ada di bagian 11 `INTEGRASI.md`. Yang paling penting: belum diuji dengan BE asli, penampil dokumen belum menyorot kutipan bukti, dan Beranda Admin belum memuat panel aktivitas Aura dan tombol atur ulang data demo.

## Masalah umum

| Gejala | Penyebab dan jalan keluar |
|---|---|
| `ECONNRESET` saat `npm install` | Jaringan terputus. Ulangi perintah yang sama, atau tambahkan `--registry=https://registry.npmmirror.com`. |
| `EPERM` di Windows | Antivirus mengunci folder. Tambahkan folder proyek ke pengecualian. |
| Perubahan `mock/server.mjs` tidak berlaku | Server tiruan belum dimulai ulang. |
| Perubahan `.env` tidak berlaku | `npm run dev` belum dimulai ulang. |
| Selalu kembali ke Login dengan "Sesi berakhir" | Token kedaluwarsa atau ditolak BE. Masuk ulang. |
| Galat CORS di produksi | Alamat Vercel belum diizinkan di BE. |
| 404 setelah dimuat ulang di Vercel | `vercel.json` belum ikut ter-deploy. |
| Login berhasil tetapi semua halaman gagal dimuat | `DEV_API_TARGET` salah (misalnya memuat `/api` di akhir) atau BE belum berjalan. |
