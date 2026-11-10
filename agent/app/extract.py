"""Ekstraksi isi invoice dari berkas.

Urutan: (1) PDF teks via pypdf + parser deterministik; (2) bila kurang field
kunci dan GEMINI_API_KEY diisi, pakai Gemini (multimodal, M2). Angka
dihitung kode, LLM hanya membaca berkas.
"""
from __future__ import annotations

import io
import re
from typing import Optional

from .errors import AgentHttpError
from .gemini import gemini_available, extract_with_gemini
from .types import ExtractionResult, Field, InvLine

# Confidence per field untuk hasil parser teks (bukan tebakan LLM).
FIELD_CONF = {
    "vendor_name": 0.98,
    "invoice_number": 0.98,
    "po_number": 0.95,
    "invoice_date": 0.97,
    "total_amount": 0.95,
    "npwp": 0.9,
}


def _unreadable(message: str) -> AgentHttpError:
    """Berkas tidak bisa dibaca → 422 UNREADABLE_FILE dengan pesan ramah."""
    return AgentHttpError("UNREADABLE_FILE", message)


def _to_int(s: str) -> int:
    digits = re.sub(r"[^\d]", "", s)
    if not digits:
        raise ValueError(f"bukan angka: {s!r}")
    return int(digits)


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = reader.pages
    except Exception:
        raise _unreadable("Berkas tidak terbaca: bukan PDF yang valid.")
    if not pages:
        raise _unreadable("Berkas tidak terbaca: PDF kosong.")
    text = "\n".join((p.extract_text() or "") for p in pages)
    if not text.strip():
        raise _unreadable(
            "Berkas tidak terbaca: isi PDF tidak berisi teks (mungkin hasil pindai)."
        )
    return text


def parse_invoice_text(text: str) -> ExtractionResult:
    res = ExtractionResult(raw_text=text)
    t = text.replace("\u00a0", " ")

    def find(key: str, pattern: str, label: str) -> Optional[str]:
        m = re.search(pattern, t, re.MULTILINE | re.IGNORECASE)
        if m:
            value = m.group(1).strip()
            res.fields.append(Field(key, label, value, FIELD_CONF[key]))
            return value
        return None

    find("vendor_name", r"^\s*Vendor\s*:\s*(.+?)\s*$", "Vendor")
    find("invoice_number", r"^\s*No\.\s*Invoice\s*:\s*(\S+)\s*$", "No. invoice")
    find("po_number", r"^\s*Ref\.\s*PO\s*:\s*(\S+)\s*$", "Referensi PO")
    find("invoice_date", r"^\s*Invoice Date\s*:\s*(\d{4}-\d{2}-\d{2})\s*$", "Tanggal invoice")
    find("npwp", r"^\s*NPWP\s*:\s*([0-9][0-9.\-]+)\s*$", "NPWP")

    for m in re.finditer(
        r"^\s*\d+\.\s+(.+?)\s*\|\s*qty\s+(\d+)\s*\|\s*unit\s+(\d+)\s*$", t, re.MULTILINE
    ):
        res.lines.append(InvLine(name=m.group(1).strip(), quantity=int(m.group(2)), unit_price=int(m.group(3))))

    if m := re.search(r"^\s*Subtotal\s*:\s*Rp\s*([\d.]+)\s*$", t, re.MULTILINE):
        res.subtotal = _to_int(m.group(1))
    if m := re.search(r"^\s*PPN\s*(\d+(?:\.\d+)?)\s*%\s*:\s*Rp\s*([\d.]+)\s*$", t, re.MULTILINE):
        res.ppn_pct = float(m.group(1))
        res.ppn_amount = _to_int(m.group(2))
    if m := re.search(r"^\s*Total\s*:\s*Rp\s*([\d.]+)\s*$", t, re.MULTILINE):
        res.total = _to_int(m.group(1))
    # Cadangan pola umum bila layout berbeda.
    if res.get("total_amount") is None:
        find("total_amount", r"(?:Total|Grand\s+Total)\s*[:=]\s*Rp?\s*([\d.]+)", "Total")
    return res


def extract_invoice(content_type: str, data: bytes) -> ExtractionResult:
    """Ekstraksi satu berkas. Melempar AgentHttpError(422) bila gagal total."""
    # 1) Coba jalur teks (PDF).
    if content_type == "application/pdf":
        try:
            text = pdf_text(data)
        except AgentHttpError:
            text = None
        if text is not None:
            res = parse_invoice_text(text)
            if len(res.fields) >= 2 and (res.lines or res.get("total_amount")):
                return res
        # PDF rusak/scan: jatuh ke LLM bila ada kunci (bisa membaca gambar halaman).
        if gemini_available():
            res = extract_with_gemini(content_type, data, retry=2)
            if res is not None:
                return res
        raise _unreadable(
            "Berkas tidak terbaca: tidak ada isi invoice yang dapat dikenali setelah 2 kali percobaan."
        )
    # 2) Gambar: hanya lewat LLM multimodal.
    if content_type.startswith("image/"):
        if not gemini_available():
            raise _unreadable(
                "Berkas gambar tidak dapat diproses: kunci LLM belum disetel."
            )
        res = extract_with_gemini(content_type, data, retry=2)
        if res is not None:
            return res
        raise _unreadable(
            "Berkas tidak terbaca: gambar terlalu buram setelah 2 kali percobaan ekstraksi."
        )
    raise _unreadable("Berkas tidak terbaca: tipe berkas tidak didukung.")
