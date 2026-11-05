# Backend: AI Invoice Reconciliation & Exception Agent

NestJS + PostgreSQL (TypeORM). Mengikuti kontrak `docs/api/openapi.yaml` (v1.0.0).

## Menjalankan

```bash
cd backend
cp .env.example .env          # isi JWT_SECRET dan DATABASE_URL
npm install
npm run start:dev             # tabel dibuat otomatis; akun demo + data master diisi otomatis bila DB kosong
```

Atau dengan Docker (backend + Postgres): `docker compose up --build`.

- API: `http://localhost:3000/api`
- Dokumentasi interaktif (dari `docs/api/openapi.yaml`): `http://localhost:3000/docs`
- Akun demo (data sintetis): `staf@demo.id`, `verif@demo.id`, `admin@demo.id`. Kata sandi dari `DEMO_PASSWORD` (bawaan `demo12345`, **ganti sebelum deploy publik**).

## Agent: tiruan dulu, sungguhan nanti

`AGENT_MODE=stub` (bawaan) memakai agent tiruan yang mengembalikan hasil contoh (CLEAN, EXCEPTION, DUPLICATE, NEEDS_REVIEW, gagal) dengan jeda dan iterasi yang disimulasikan, sehingga FE dan BE bisa bekerja tanpa menunggu tim AI. Nama berkas menentukan hasilnya: mengandung `clean`, `exception`, `duplicate`, `review`, atau `gagal`; selain itu sebaran acak tetap.

Saat agent siap: `AGENT_MODE=http` dan `AGENT_URL=...`. BE memanggil `POST {AGENT_URL}/process` dan menunggu respons (maks. `AGENT_TIMEOUT_MS`, bawaan 120 dtk). **Kontrak ini masih draf**; bentuk permintaan dan respons ada di `src/processing/agent.types.ts` dan perlu disepakati dengan tim AI.

## Untuk tim AI

- `db/schema.sql`: DDL seluruh tabel (hasil `pg_dump`).
- `db/agent-readonly.sql`: membuat user `agent_ro` yang hanya bisa **membaca** data master dan kolom invoice yang perlu untuk cek duplikat. Agent tidak menulis ke database.
- Data master sintetis ada di `src/seed/master-data.ts` (vendor, barang, PO, GRN). Contoh: `PO-0012` punya selisih harga dan jumlah yang disengaja.
- Bentuk hasil analisis (`extraction`, `comparison`, `tax_check`, `duplicate`, `investigation`, `finding`) sama dengan `InvoiceDetail` di `docs/api/openapi.yaml`.

## Struktur

```
src/
  common/        enum, error seragam, guard JWT + peran, filter, paginasi
  database/      entitas TypeORM (satu berkas)
  auth/ users/ settings/ audit/ dashboard/ batches/
  invoices/
    decision.rules.ts     SATU-SATUNYA tempat aturan keputusan (allowed_actions + validasi)
    invoice.mapper.ts     SATU-SATUNYA tempat bentuk respons disusun
  processing/    antrean dalam proses + klien agent (stub / http)
  storage/       simpan berkas + deteksi tipe dari isi berkas + hash
  demo/          batch contoh dan reset
  seed/          data master, akun demo
scripts/smoke.py          uji alur utama lewat HTTP
```

## Aturan yang dijaga di server

- Tiga status terpisah: `processing_status`, `verdict`, `decision_status`.
- Staf: Setujui/Tolak/Eskalasi pada invoice PENDING berverdict CLEAN/EXCEPTION/DUPLICATE. Verifikator: Setujui/Tolak (final) pada NEEDS_REVIEW dan ESCALATED. Admin tidak memutuskan.
- Invoice yang sudah APPROVED/REJECTED tidak dapat diubah. Pelanggaran peran 403 `FORBIDDEN`, pelanggaran status 409 `INVALID_TRANSITION`.
- Agent tidak pernah mengubah `decision_status`. Temuan EXCEPTION dengan keyakinan di bawah ambang otomatis menjadi NEEDS_REVIEW (dijaga di BE, bukan hanya di agent).
- Setiap keputusan, perubahan pengaturan, dan perubahan pengguna menulis `audit_logs` dalam transaksi yang sama. Tabel itu hanya bertambah.
- Toleransi harga dan ambang keyakinan "dibekukan" ke tiap invoice saat batch dibuat. Perubahan Admin hanya berlaku untuk batch berikutnya.
- Berkas ditolak bila tipenya (dari isi berkas, bukan nama) bukan PDF/JPG/PNG, melebihi `MAX_FILE_SIZE_MB`, atau hash-nya sudah pernah diunggah.
- Server yang restart di tengah proses mengembalikan invoice `PROCESSING` ke `QUEUED`.

## Uji

```bash
npm test                                   # aturan keputusan + pagar keyakinan
python3 scripts/smoke.py http://localhost:3000/api   # alur lengkap, butuh server berjalan dan DB baru
```

## Belum dikerjakan

`POST /master/{type}/import` (impor CSV) menjawab `501 NOT_IMPLEMENTED`. Data master diisi lewat seed (`npm run db:seed`). `GET /master/{type}` dan `GET /reports/metrics` sudah berfungsi (definisi metrik ada di `openapi.yaml`).

## Catatan keamanan

- Jangan commit `.env`. Repo ini publik.
- `DB_SYNC=true` membuat tabel otomatis (praktis untuk lomba). Untuk produksi sungguhan pakai migrasi.
- Semua data di repo ini sintetis.
