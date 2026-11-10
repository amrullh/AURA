"""Empat tool baca-saja untuk investigasi dan cek duplikat.

Hasil selalu dari database (kode), bukan dari LLM.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from . import db


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().casefold())


@dataclass
class PoLineInfo:
    item_id: str
    name: str
    unit: str
    quantity: int
    unit_price: int
    received: Optional[int]  # None = tidak ada GRN sama sekali


@dataclass
class PoDetail:
    po_number: str
    po_date: str
    vendor_id: str
    vendor_name: str
    lines: list[PoLineInfo]
    grn_number: Optional[str]
    grn_date: Optional[str]


def lookup_po_detail(po_number: str) -> Optional[PoDetail]:
    """Baris PO, harga, dan jumlah yang diterima (GRN) untuk satu nomor PO."""
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.po_number, p.po_date::text, p.vendor_id, v.name,
                   pl.line_no, i.id, i.name, i.unit, pl.quantity, pl.unit_price
            FROM purchase_orders p
            JOIN vendors v ON v.id = p.vendor_id
            JOIN po_lines pl ON pl.po_id = p.id
            JOIN items i ON i.id = pl.item_id
            WHERE p.po_number = %s
            ORDER BY pl.line_no
            """,
            (po_number,),
        )
        rows = cur.fetchall()
        if not rows:
            return None
        po_no, po_date, vendor_id, vendor_name = rows[0][0], rows[0][1], rows[0][2], rows[0][3]
        lines = [
            PoLineInfo(item_id=r[5], name=r[6], unit=r[7], quantity=r[8], unit_price=r[9], received=None)
            for r in rows
        ]
        cur.execute(
            """
            SELECT g.grn_number, g.received_date::text, gl.item_id, gl.quantity_received
            FROM goods_receipts g
            JOIN purchase_orders p ON p.id = g.po_id
            JOIN grn_lines gl ON gl.grn_id = g.id
            WHERE p.po_number = %s
            """,
            (po_number,),
        )
        grn_rows = cur.fetchall()
        grn_number = grn_date = None
        if grn_rows:
            grn_number, grn_date = grn_rows[0][0], grn_rows[0][1]
            received: dict[str, int] = {}
            for _, _, item_id, qty in grn_rows:
                received[item_id] = received.get(item_id, 0) + qty
            if grn_number is not None:
                for line in lines:
                    line.received = received.get(line.item_id, 0)
        return PoDetail(po_no, po_date, vendor_id, vendor_name, lines, grn_number, grn_date)


def cek_grn_status(po_number: str) -> Optional[dict]:
    """GRN per PO: nomor, tanggal, dan jumlah diterima per barang."""
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT g.grn_number, g.received_date::text, i.name, gl.quantity_received
            FROM goods_receipts g
            JOIN purchase_orders p ON p.id = g.po_id
            JOIN grn_lines gl ON gl.grn_id = g.id
            JOIN items i ON i.id = gl.item_id
            WHERE p.po_number = %s
            ORDER BY gl.line_no
            """,
            (po_number,),
        )
        rows = cur.fetchall()
    if not rows:
        return None
    return {
        "grn_number": rows[0][0],
        "received_date": rows[0][1],
        "lines": [{"item": r[2], "quantity_received": r[3]} for r in rows],
    }


def tarik_kontrak_vendor(vendor_id: str) -> Optional[dict]:
    """Klausul kontrak vendor (teks sintetis). None bila vendor tidak punya kontrak."""
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT name, has_contract, contract_text FROM vendors WHERE id = %s",
            (vendor_id,),
        )
        row = cur.fetchone()
    if not row or not row[1]:
        return None
    return {"vendor_name": row[0], "contract_text": row[2]}


def cari_invoice_duplikat(
    invoice_id: str,
    invoice_number: Optional[str],
    vendor_id: Optional[str],
    total_amount: Optional[int],
    invoice_date: Optional[str],
) -> Optional[dict]:
    """Duplikat bila (nomor invoice + vendor) sama, atau (vendor + total + tanggal) sama."""
    clauses = ["id <> %s", "invoice_number IS NOT NULL"]
    params: list = [invoice_id]
    or_parts: list[str] = []
    if invoice_number and vendor_id:
        or_parts.append("(invoice_number = %s AND vendor_id = %s)")
        params += [invoice_number, vendor_id]
    if vendor_id and total_amount is not None and invoice_date:
        or_parts.append("(vendor_id = %s AND total_amount = %s AND invoice_date = %s::date)")
        params += [vendor_id, total_amount, invoice_date]
    if not or_parts:
        return None
    sql = (
        "SELECT id, invoice_number, vendor_id, vendor_name, total_amount, invoice_date::text, created_at "
        "FROM invoices WHERE " + " AND ".join(clauses) + " AND (" + " OR ".join(or_parts) + ") "
        "ORDER BY created_at LIMIT 1"
    )
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
    if not row:
        return None
    created: datetime = row[6]
    return {
        "id": row[0],
        "invoice_number": row[1],
        "vendor_id": row[2],
        "vendor_name": row[3],
        "total_amount": int(row[4]) if row[4] is not None else None,
        "invoice_date": row[5],
        "created_at": created,
        "match_basis": (
            ["invoice_number", "vendor"]
            if invoice_number and vendor_id and row[1] == invoice_number
            else ["vendor", "total_amount", "invoice_date"]
        ),
    }


def resolve_vendor(name: Optional[str]) -> Optional[dict]:
    """Cocokkan nama vendor dari invoice ke master (persis, lalu longgar)."""
    if not name:
        return None
    q = _norm(name)
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name, npwp FROM vendors ORDER BY length(name)")
        rows = [(r[0], r[1], r[2]) for r in cur.fetchall()]
    exact = [r for r in rows if _norm(r[1]) == q]
    if exact:
        r = exact[0]
        return {"id": r[0], "name": r[1], "npwp": r[2]}
    loose = [r for r in rows if q in _norm(r[1]) or _norm(r[1]) in q]
    if len(loose) == 1:
        r = loose[0]
        return {"id": r[0], "name": r[1], "npwp": r[2]}
    return None


def list_vendors() -> list[dict]:
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name, npwp FROM vendors ORDER BY name")
        return [{"id": r[0], "name": r[1], "npwp": r[2]} for r in cur.fetchall()]
