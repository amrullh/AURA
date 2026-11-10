# Agent AI (kontrak BE ↔ AI)

Backend memanggil agent lewat HTTP atau pakai stub saat agent belum siap.

## Jalur

- `AGENT_MODE=stub` (bawaan): agent tiruan di `src/processing/stub`. Nama berkas menentukan skenario; selain itu sebaran acak.
- `AGENT_MODE=http`: backend memanggil `POST {AGENT_URL}/process` dengan timeout maksimal `AGENT_TIMEOUT_MS` (bawaan 120 detik).

## Kontrak HTTP

**Request:** `POST {AGENT_URL}/process`, body JSON sesuai `AgentRequest` di `src/processing/agent.types.ts`.

**Response:** JSON sesuai `AgentResult` di `src/processing/agent.types.ts`.

## Bentuk respons

Bagian `extraction`, `comparison`, `tax_check`, `duplicate`, `investigation`, dan `finding` mengikuti struktur `InvoiceDetail` di `docs/api/openapi.yaml`. Backend tidak memaklumi bentuk dalam; hanya menyimpan dan meneruskan ke FE.

## Agent hanya membaca

Agent membaca PO, GRN, dan vendor lewat database baca-saja (`db/agent-readonly.sql`). Agent tidak menulis ke database.

## Contoh skenario (stub)

Berkas `src/processing/stub/scenarios.json` berisi empat skenario statis (CLEAN, EXCEPTION, DUPLICATE, NEEDS_REVIEW) yang dipakai oleh agent tiruan. Gunakan sebagai acuan bentuk respons dan variasi yang diharapkan FE.
