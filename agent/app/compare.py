"""Pencocokan 3 arah (PO, GRN, invoice) — hitungan deterministik.

Aturan (PANDUAN_TIM_AI.md bagian 5):
- PRICE:  expected = harga PO,  actual = harga invoice; selisih bila
  |actual-expected|/expected*100 > tolerance.
- QUANTITY: expected = diterima GRN, actual = invoice; selisih bila actual > expected.
- ITEM: baris invoice tidak ada di PO; expected 0, actual = nilai baris.
- Totals: difference = invoice_total - grn_total_at_po_price.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from .types import ExtractionResult
from .tools import PoDetail, _norm


@dataclass
class DiffInfo:
    type: str
    expected: int
    actual: int
    delta: int
    delta_pct: Optional[float]
    within_tolerance: bool


@dataclass
class LineResult:
    line_no: int
    item_name: str
    po_quantity: Optional[int]
    po_unit_price: Optional[int]
    grn_received: Optional[int]
    inv_quantity: int
    inv_unit_price: int
    status: str
    diffs: list[DiffInfo]


def _pct(delta: int, expected: int) -> Optional[float]:
    if expected == 0:
        return None
    return round(abs(delta) / expected * 100, 1)


def compare(res: ExtractionResult, po: Optional[PoDetail], tolerance_pct: float) -> list[LineResult]:
    """Cocokkan tiap baris invoice ke baris PO (via nama barang)."""
    po_by_name = {}
    if po:
        for line in po.lines:
            po_by_name[_norm(line.name)] = line

    results: list[LineResult] = []
    for i, inv in enumerate(res.lines, start=1):
        p = po_by_name.get(_norm(inv.name)) if po else None
        diffs: list[DiffInfo] = []
        if p is None:
            # Baris tidak ada di PO (atau tidak ada PO sama sekali).
            amount = inv.quantity * inv.unit_price
            diffs.append(DiffInfo("ITEM", 0, amount, amount, None, False))
            results.append(
                LineResult(i, inv.name, None, None, None, inv.quantity, inv.unit_price, "MISMATCH", diffs)
            )
            continue

        received = p.received  # None bila tidak ada GRN
        if p.unit_price and inv.unit_price != p.unit_price:
            delta = inv.unit_price - p.unit_price
            within = abs(delta) / p.unit_price * 100 <= tolerance_pct
            diffs.append(
                DiffInfo("PRICE", p.unit_price, inv.unit_price, delta, _pct(delta, p.unit_price), within)
            )
        if inv.quantity > (received or 0):
            delta = inv.quantity - (received or 0)
            diffs.append(
                DiffInfo("QUANTITY", received or 0, inv.quantity, delta, _pct(delta, received or 0), False)
            )
        status = "MATCH" if all(d.within_tolerance for d in diffs) else "MISMATCH"
        results.append(
            LineResult(
                i, inv.name, p.quantity, p.unit_price, received,
                inv.quantity, inv.unit_price, status, diffs,
            )
        )
    return results


def totals(results: list[LineResult], po: Optional[PoDetail], res: ExtractionResult) -> dict:
    po_total = sum(l.quantity * l.unit_price for l in po.lines) if po else 0
    grn_total = 0
    if po:
        for l in po.lines:
            grn_total += (l.received or 0) * l.unit_price
    # invoice_total diutamakan dari total di dokumen; verifikasi terhadap jumlah baris.
    line_sum = sum(r.inv_quantity * r.inv_unit_price for r in results)
    invoice_total = res.total if (res.total is not None and (res.total == line_sum or not results)) else line_sum
    return {
        "po_total": po_total,
        "grn_total_at_po_price": grn_total,
        "invoice_total": invoice_total,
        "difference": invoice_total - grn_total,
    }


def has_out_of_tolerance(results: list[LineResult]) -> bool:
    return any(not d.within_tolerance for r in results for d in r.diffs)


def fmt_rupiah(n: int) -> str:
    return f"Rp {n:,.0f}".replace(",", ".")
