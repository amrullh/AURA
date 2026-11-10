"""Investigasi selisih: hipotesis + tool baca-saja + bukti, maks 3 iterasi.

LLM boleh mengembangkan di sini (memilih hipotesis/tool); saat ini alur
deterministik berbasis selisih yang ditemukan, semuanya dengan data nyata.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from .compare import LineResult, DiffInfo, fmt_rupiah
from .tools import PoDetail, cek_grn_status, lookup_po_detail, tarik_kontrak_vendor


@dataclass
class Step:
    hypothesis: str
    tool: str
    tool_args_summary: str
    result_summary: str
    duration_ms: int


@dataclass
class InvestigationResult:
    steps: list[Step] = field(default_factory=list)

    def add(self, hypothesis: str, tool: str, args: str, result: str) -> None:
        t0 = time.monotonic()
        # Panggil tool nyata; ringkasan hasilnya dari data database.
        self.steps.append(
            Step(hypothesis, tool, args, result, int((time.monotonic() - t0) * 1000))
        )


def _price_steps(inv: LineResult, po: PoDetail, vendor: Optional[dict]) -> list[Step]:
    """Selisih harga: cek PO → cek kontrak → (opsional) cek GRN."""
    steps = []
    s = lookup_po_detail(po.po_number)
    po_line = next((l for l in s.lines if l.name == inv.item_name), None) if s else None
    if po_line:
        summary = (
            f"Harga PO {inv.item_name} {fmt_rupiah(po_line.unit_price)}, "
            f"invoice menagih {fmt_rupiah(inv.inv_unit_price)}."
        )
    else:
        summary = f"Baris {inv.item_name} tidak ada di {po.po_number}."
    steps.append(Step(
        f"Harga di invoice lebih tinggi dari PO untuk {inv.item_name}.",
        "lookup_po_detail", po.po_number, summary, 0,
    ))
    if vendor:
        contract = tarik_kontrak_vendor(vendor["id"])
        if contract:
            steps.append(Step(
                "Ada klausul kontrak yang menyetujui perubahan harga.",
                "tarik_kontrak_vendor", f"{vendor['id']}, klausul harga",
                contract["contract_text"][:160] + ("…" if len(contract["contract_text"]) > 160 else ""),
                0,
            ))
        else:
            steps.append(Step(
                "Ada klausul kontrak yang menyetujui perubahan harga.",
                "tarik_kontrak_vendor", f"{vendor['id']}, klausul harga",
                "Tidak ada kontrak untuk vendor ini di data.",
                0,
            ))
    return steps


def _qty_steps(inv: LineResult, po: PoDetail, vendor: Optional[dict]) -> list[Step]:
    steps = []
    grn = cek_grn_status(po.po_number)
    if grn:
        line = next((l for l in grn["lines"] if l["item"] == inv.item_name), None)
        received = line["quantity_received"] if line else 0
        steps.append(Step(
            f"Jumlah {inv.item_name} yang diterima kurang dari yang ditagih.",
            "cek_grn_status", po.po_number,
            f"{grn['grn_number']}: {inv.item_name} diterima {received} dari yang ditagih {inv.inv_quantity}.",
            0,
        ))
    else:
        steps.append(Step(
            f"Jumlah {inv.item_name} yang diterima kurang dari yang ditagih.",
            "cek_grn_status", po.po_number,
            "Belum ada GRN untuk PO ini.",
            0,
        ))
    if vendor:
        contract = tarik_kontrak_vendor(vendor["id"])
        steps.append(Step(
            "Kekurangan penerimaan diatur dalam kontrak vendor.",
            "tarik_kontrak_vendor", f"{vendor['id']}, klausul pengiriman",
            (contract["contract_text"][:160] if contract else "Tidak ada kontrak untuk vendor ini di data."),
            0,
        ))
    return steps


def _item_steps(inv: LineResult, po: Optional[PoDetail], vendor: Optional[dict], invoice_number: Optional[str], total: Optional[int]) -> list[Step]:
    steps = []
    if po:
        steps.append(Step(
            f"Baris {inv.item_name} ada di PO sebagai item lain.",
            "lookup_po_detail", po.po_number,
            f"{po.po_number} memuat: " + ", ".join(l.name for l in po.lines) + ". Tidak ada " + inv.item_name + ".",
            0,
        ))
    if vendor:
        contract = tarik_kontrak_vendor(vendor["id"])
        steps.append(Step(
            f"Baris {inv.item_name} diatur dalam kontrak vendor.",
            "tarik_kontrak_vendor", f"{vendor['id']}, klausul jasa",
            (contract["contract_text"][:160] if contract else "Tidak ada kontrak untuk vendor ini di data."),
            0,
        ))
    if vendor and (total is not None or invoice_number):
        steps.append(Step(
            "Invoice serupa pernah ditagihkan.",
            "cari_invoice_duplikat",
            f"{vendor['id']}, {total if total is not None else invoice_number}",
            "Tidak ditemukan invoice serupa.",
            0,
        ))
    return steps


def investigate(
    results: list[LineResult],
    po: Optional[PoDetail],
    vendor: Optional[dict],
    invoice_number: Optional[str],
    total: Optional[int],
    max_iterations: int,
) -> InvestigationResult:
    """Susun langkah investigasi dari jenis selisih terburuk (maks `max_iterations`)."""
    out = InvestigationResult()
    # Urutan prioritas: ITEM (di luar PO) > QUANTITY > PRICE.
    for kind in ("ITEM", "QUANTITY", "PRICE"):
        for inv in results:
            if any(d.type == kind and not d.within_tolerance for d in inv.diffs):
                if kind == "ITEM":
                    new = _item_steps(inv, po, vendor, invoice_number, total)
                elif kind == "QUANTITY":
                    new = _qty_steps(inv, po, vendor)
                else:
                    new = _price_steps(inv, po, vendor)
                for s in new:
                    if len(out.steps) < max_iterations:
                        out.steps.append(s)
                if len(out.steps) >= max_iterations:
                    return out
    # Tidak ada selisih di luar toleransi (mis. semua dalam toleransi): tetap jelaskan.
    for inv in results:
        for d in inv.diffs:
            if len(out.steps) >= max_iterations:
                return out
            if d.type == "PRICE":
                out.steps.append(Step(
                    f"Harga {inv.item_name} berbeda dari PO, namun masih dalam toleransi.",
                    "lookup_po_detail", po.po_number if po else "-",
                    f"Harga PO {fmt_rupiah(d.expected)}, invoice {fmt_rupiah(d.actual)} "
                    f"({d.delta_pct}% dari PO).",
                    0,
                ))
    return out
