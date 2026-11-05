-- User database BACA-SAJA untuk tim AI. Jalankan sekali sebagai superuser, setelah tabel dibuat (backend pernah dijalankan).
-- Ganti kata sandi sebelum dipakai di server bersama.
CREATE ROLE agent_ro LOGIN PASSWORD 'ganti-sandi-agent';
GRANT CONNECT ON DATABASE invoice_agent TO agent_ro;
GRANT USAGE ON SCHEMA public TO agent_ro;

-- Data master: dibaca penuh oleh tool lookup_po_detail, cek_grn_status, tarik_kontrak_vendor.
GRANT SELECT ON vendors, items, purchase_orders, po_lines, goods_receipts, grn_lines TO agent_ro;

-- Invoice: hanya kolom yang perlu untuk pengecekan duplikat (tool cari_invoice_duplikat).
GRANT SELECT (id, invoice_number, vendor_id, vendor_name, po_number, invoice_date, total_amount, file_hash, processing_status, verdict, created_at)
  ON invoices TO agent_ro;
-- Agent tidak dapat menulis apa pun. Hasil analisis dikembalikan lewat respons POST /process, dan BE yang menyimpannya.
