"""Pemanggilan Gemini untuk ekstraksi multimodal (M2).

LLM membaca berkas (PDF/gambar) dan mengembalikan JSON field. Semua angka
tetap diverifikasi/dihitung ulang oleh kode di pipeline, LLM hanya pembaca.
"""
from __future__ import annotations

import base64
import json
import os
from typing import Optional

import requests

from .types import ExtractionResult, Field, InvLine

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PROMPT = """Kamu adalah pembaca dokumen invoice. Ekstrak isi invoice dari berkas
terlampir. Balas HANYA JSON valid dengan bentuk persis:
{
  "vendor_name": string | null,
  "invoice_number": string | null,
  "po_number": string | null,
  "invoice_date": "YYYY-MM-DD" | null,
  "npwp": string | null,
  "total_amount": integer | null,
  "lines": [{"name": string, "quantity": integer, "unit_price": integer}],
  "ppn_pct": number | null,
  "ppn_amount": integer | null,
  "confidence": {field: number 0..1}
}
Aturan: uang dalam Rupiah bilangan bulat; null bila tidak terbaca; jangan
mengarang angka yang tidak ada di dokumen; confidence per field sesuai
kejelasan bacaan."""


def gemini_available() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def _call(data: bytes, mime: str) -> Optional[dict]:
    key = os.environ.get("GEMINI_API_KEY")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    body = {
        "contents": [
            {
                "parts": [
                    {"text": PROMPT},
                    {"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}},
                ]
            }
        ],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0},
    }
    try:
        r = requests.post(
            GEMINI_URL.format(model=model),
            headers={"x-goog-api-key": key},
            json=body,
            timeout=60,
        )
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except Exception:
        return None


def extract_with_gemini(content_type: str, data: bytes, retry: int = 2) -> Optional[ExtractionResult]:
    """Coba ekstraksi LLM sebanyak `retry` kali; None bila semua gagal."""
    for _ in range(retry):
        raw = _call(data, content_type)
        if not raw or not isinstance(raw, dict):
            continue
        res = ExtractionResult()
        conf = raw.get("confidence") or {}
        for key, label in [
            ("vendor_name", "Vendor"),
            ("invoice_number", "No. invoice"),
            ("po_number", "Referensi PO"),
            ("invoice_date", "Tanggal invoice"),
            ("total_amount", "Total"),
            ("npwp", "NPWP"),
        ]:
            v = raw.get(key)
            if v not in (None, ""):
                c = float(conf.get(key, 0.7))
                res.fields.append(Field(key, label, str(v), min(max(c, 0.0), 1.0)))
        for line in raw.get("lines") or []:
            try:
                res.lines.append(
                    InvLine(
                        name=str(line["name"]).strip(),
                        quantity=int(line["quantity"]),
                        unit_price=int(line["unit_price"]),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        if raw.get("total_amount") is not None:
            res.total = int(raw["total_amount"])
        if raw.get("ppn_pct") is not None:
            res.ppn_pct = float(raw["ppn_pct"])
        if raw.get("ppn_amount") is not None:
            res.ppn_amount = int(raw["ppn_amount"])
        if res.get("vendor_name") or res.get("invoice_number") or res.lines:
            return res
    return None
