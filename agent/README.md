# AURA Agent

AI Invoice Reconciliation & Exception Agent (GTMIC 2026). Menerima satu berkas
invoice lewat `POST /process` (dipanggil BE), mengekstrak isinya, mencocokkan
dengan PO dan GRN (3-way match), menyelidiki selisih, dan mengembalikan verdict
berbukti. Agent tidak pernah menyetujui/menolak dan tidak menulis ke database.

Detail kontrak: `docs/api/PANDUAN_TIM_AI.md` dan contoh di `docs/ai/examples/`.

## Menjalankan

```bash
uv sync                 # pasang dependensi
uv run uvicorn app.main:app --port 8000
```

- Health: `GET http://localhost:8000/health`
- Proses: `POST http://localhost:8000/process` (bentuk request: `docs/ai/examples/request.json`)
- Konfigurasi: `.env` (salin dari `.env.example`). `AGENT_DB_URL` memakai user
  baca-saja `agent_ro` (buat lewat `backend/db/agent-readonly.sql`).
- `GEMINI_API_KEY` (opsional): bila diisi, berkas gambar (JPG/PNG) dan PDF yang
  teksnya sulit dibaca diekstrak lewat Gemini. Tanpa kunci, hanya PDF teks.

## Menghubungkan ke BE

Di `backend/.env`:

```
AGENT_MODE=http
AGENT_URL=http://localhost:8000
```

Lalu jalankan `POST /demo/sample-batch` (login sebagai Staf) atau unggah invoice
biasa. Hasil agent tampil di FE.

## Uji

```bash
uv run pytest
```

- `tests/test_contract.py` memvalidasi kelima contoh response terhadap skema pydantic.
- `tests/test_compare.py` memverifikasi hitungan 3-way match (PO-0012 → selisih Rp 640.000).

## Struktur

```
app/
  main.py        FastAPI: GET /health, POST /process
  schemas.py     Kontrak request/response (pydantic) — sumber kebenaran bentuk
  errors.py      Error ramah pengguna (422/500)
  db.py          Koneksi PostgreSQL baca-saja
  tools.py       4 tool baca-saja: lookup_po_detail, cek_grn_status,
                 cari_invoice_duplikat, tarik_kontrak_vendor
  extract.py     Ekstraksi PDF (pypdf) + parser; fallback LLM bila kunci diisi
  gemini.py      Pemanggilan Gemini (ekstraksi multimodal, M2)
  compare.py     Pencocokan 3 arah deterministik (selisih, total, toleransi)
  investigate.py Investigasi selisih: hipotesis + tool + bukti (maks 3 iterasi)
  pipeline.py    Orkestrasi: ekstraksi → duplikat → pajak → cocok → investigasi
```
