"""Orkestrasi satu invoice.

1 Ekstraksi → 2 Cek duplikat → 3 Cek faktur pajak → 4 Cocok 3 arah
→ 5 Investigasi (bila selisih di luar toleransi) → 6 Temuan + keyakinan.
"""
from __future__ import annotations

import base64
import re
from datetime import date
from typing import Optional

from . import tools
from .compare import compare, fmt_rupiah, has_out_of_tolerance, totals
from .errors import AgentHttpError
from .extract import extract_invoice
from .investigate import investigate
from .schemas import (
    AgentResult, Comparison, ComparisonLine, ComparisonTotals, Diff, Duplicate,
    Evidence, Extraction, ExtractionField, Finding, GrnSide, InvoiceInfo,
    Investigation, InvestigationStep, Label, PoSide, ProcessRequest, TaxCheck,
    TaxItem,
)
from .tools import PoDetail

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_date(s: Optional[str]) -> Optional[str]:
    if not s or not DATE_RE.match(s):
        return None
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        return None


def _field_conf(res, key: str) -> float:
    for f in res.fields:
        if f.key == key:
            return f.confidence
    return 0.0


def _low_confidence_fields(res) -> list[str]:
    """Field kunci dengan keyakinan < 0,7 (PANDUAN bagian 5)."""
    keys = ["vendor_name", "invoice_number", "po_number", "total_amount"]
    present = [f.key for f in res.fields]
    return [k for k in keys if k in present and _field_conf(res, k) < 0.7]


def _build_comparison(res, po: Optional[PoDetail], tolerance: float):
    results = compare(res, po, tolerance)
    t = totals(results, po, res)
    lines = []
    for r in results:
        diffs = [
            Diff(
                type=d.type, expected=d.expected, actual=d.actual, delta=d.delta,
                delta_pct=d.delta_pct, within_tolerance=d.within_tolerance,
            )
            for d in r.diffs
        ]
        po_side = PoSide(quantity=r.po_quantity, unit_price=r.po_unit_price) if r.po_quantity is not None or r.po_unit_price is not None else None
        grn_side = (
            GrnSide(quantity_received=r.grn_received)
            if (po is not None and r.grn_received is not None)
            else None
        )
        lines.append(
            ComparisonLine(
                line_no=r.line_no, item_name=r.item_name, po=po_side, grn=grn_side,
                invoice={"quantity": r.inv_quantity, "unit_price": r.inv_unit_price},
                status=r.status, diffs=diffs,
            )
        )
    comp = Comparison(
        tolerance_pct=tolerance,
        lines=lines,
        totals=ComparisonTotals(**t),
    )
    return results, comp


def _tax_check(res, vendor: Optional[dict], po_found: bool) -> TaxCheck:
    items: list[TaxItem] = []
    items.append(TaxItem(
        key="serial_number", label="Nomor seri faktur pajak",
        result="NA", detail="Belum pernah dipakai",
    ))
    inv_npwp = res.get("npwp")
    if vendor and inv_npwp and inv_npwp == vendor["npwp"]:
        items.append(TaxItem(key="npwp", label="NPWP", result="PASS", detail="Sesuai master vendor"))
    elif vendor and inv_npwp:
        items.append(TaxItem(key="npwp", label="NPWP", result="FAIL", detail="Tidak sesuai master vendor"))
    else:
        items.append(TaxItem(key="npwp", label="NPWP", result="NA", detail="NPWP tidak terbaca pada dokumen"))
    if res.total and res.ppn_amount is not None and res.ppn_pct:
        expect = round(res.total * res.ppn_pct / 100)
        if abs(res.ppn_amount - expect) <= max(1, abs(expect) * 0.005):
            items.append(TaxItem(key="ppn", label="PPN", result="PASS", detail="Sesuai perhitungan"))
        else:
            items.append(TaxItem(key="ppn", label="PPN", result="FAIL", detail=f"Harusnya {fmt_rupiah(expect)}"))
    elif po_found:
        items.append(TaxItem(key="ppn", label="PPN", result="NA", detail="PPN tidak tercantum pada invoice"))
    else:
        items.append(TaxItem(key="ppn", label="PPN", result="NA", detail="Tidak dapat dihitung tanpa PO"))
    return TaxCheck(items=items)


def _po_evidence(po: PoDetail, item_name: Optional[str] = None) -> Optional[Evidence]:
    line = next((l for l in po.lines if l.name == item_name), po.lines[0])
    return Evidence(
        source_type="PO", source_ref=po.po_number, page=1,
        quote=f"{line.name}, {line.quantity} {line.unit} @ {fmt_rupiah(line.unit_price)}",
    )


def _grn_evidence(po: PoDetail, item_name: str) -> Optional[Evidence]:
    line = next((l for l in po.lines if l.name == item_name), None)
    if not line or line.received is None:
        return None
    return Evidence(
        source_type="GRN", source_ref=po.grn_number or po.po_number, page=1,
        quote=f"{line.name}, diterima {line.received} {line.unit}",
    )


def _invoice_evidence(res, invoice_number: Optional[str], total: Optional[int]) -> Optional[Evidence]:
    if invoice_number is None:
        return None
    quote = f"No. Invoice: {invoice_number}"
    if total is not None:
        quote += f", Total {fmt_rupiah(total)}"
    return Evidence(source_type="INVOICE", source_ref=invoice_number, page=1, quote=quote)


def _contract_evidence(vendor: dict, po: Optional[PoDetail]) -> Optional[Evidence]:
    if not vendor:
        return None
    text = tools.tarik_kontrak_vendor(vendor["id"])
    if not text:
        return None
    return Evidence(
        source_type="CONTRACT", source_ref=f"Kontrak {vendor['name']}", page=1,
        quote=text["contract_text"][:200],
    )


def run(req: ProcessRequest) -> AgentResult:
    try:
        data = base64.b64decode(req.file_base64, validate=True)
    except Exception:
        raise AgentHttpError("UNREADABLE_FILE", "Berkas tidak terbaca: isi berkas rusak.")

    # 1. Ekstraksi
    res = extract_invoice(req.content_type, data)
    po_number = res.get("po_number")
    inv_date = _parse_date(res.get("invoice_date"))
    vendor_name = res.get("vendor_name")
    invoice_number = res.get("invoice_number")
    total = res.total
    vendor = tools.resolve_vendor(vendor_name)

    extraction = Extraction(
        fields=[
            ExtractionField(key=f.key, label=f.label, value=f.value, confidence=round(f.confidence, 2))
            for f in res.fields
        ]
    )
    invoice_info = InvoiceInfo(
        invoice_number=invoice_number,
        vendor_id=vendor["id"] if vendor else None,
        vendor_name=vendor["name"] if vendor else vendor_name,
        po_number=po_number,
        invoice_date=inv_date,
        total_amount=total,
    )

    # 2. Cek duplikat (kode, baca tabel invoices)
    dup = tools.cari_invoice_duplikat(
        req.invoice_id, invoice_number,
        vendor["id"] if vendor else None, total, inv_date,
    )
    if dup:
        finding = Finding(
            summary=(
                f"Nomor invoice, vendor, dan total sama dengan invoice "
                f"{dup['invoice_number']} yang sudah ada di sistem. "
                f"Berkasnya berbeda (hasil unggah ulang)."
            ),
            recommendation="Tolak sebagai duplikat agar tidak dibayar dua kali.",
            confidence=0.93,
            labels=[Label(type="FACT", text="Atribut kunci identik dengan invoice yang sudah ada di sistem.")],
            evidence=[_invoice_evidence(res, dup["invoice_number"], dup["total_amount"])],
        )
        return AgentResult(
            invoice=invoice_info, verdict="DUPLICATE", confidence=0.93,
            difference_amount=None, iterations=0, review_reason=None,
            extraction=extraction, comparison=None,
            tax_check=_tax_check(res, vendor, po_found=False),
            duplicate=Duplicate(
                original_invoice_id=dup["id"],
                original_invoice_number=dup["invoice_number"] or "",
                original_total_amount=dup["total_amount"] or 0,
                original_created_at=dup["created_at"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                match_basis=dup["match_basis"],
            ),
            investigation=None, finding=finding,
        )

    # PO tidak ditemukan → kasus khusus NEEDS_REVIEW
    po: Optional[PoDetail] = None
    if po_number:
        po = tools.lookup_po_detail(po_number)
        if po is None:
            steps = [
                InvestigationStep(
                    step=1,
                    hypothesis="Nomor PO terbaca salah.",
                    tool="lookup_po_detail",
                    tool_args_summary=po_number,
                    result_summary=f"{po_number} tidak ada di data master.",
                    duration_ms=0,
                )
            ]
            finding = Finding(
                summary=f"Invoice merujuk {po_number} yang tidak ada di data master, sehingga pencocokan 3 arah tidak dapat dilakukan.",
                recommendation="Minta pemesan atau vendor mengonfirmasi nomor PO yang benar.",
                confidence=0.6,
                labels=[
                    Label(type="FACT", text=f"{po_number} tidak ditemukan."),
                    Label(type="HYPOTHESIS", text="Nomor PO salah ketik atau belum diinput."),
                ],
                evidence=[_invoice_evidence(res, invoice_number, total)],
            )
            return AgentResult(
                invoice=invoice_info, verdict="NEEDS_REVIEW", confidence=0.6,
                difference_amount=None, iterations=1,
                review_reason=f"PO {po_number} tidak ditemukan di data master",
                extraction=extraction, comparison=None,
                tax_check=_tax_check(res, vendor, po_found=False),
                duplicate=None,
                investigation=Investigation(iterations=1, max_iterations=req.settings.max_iterations, steps=steps),
                finding=finding,
            )
    elif not res.lines and not invoice_number:
        raise AgentHttpError(
            "UNREADABLE_FILE",
            "Berkas tidak terbaca: tidak ada referensi PO maupun isi invoice yang dikenali.",
        )

    # 3. Cek faktur pajak (informasi)
    tax = _tax_check(res, vendor, po_found=po is not None)

    # 4. Pencocokan 3 arah
    if not res.lines:
        # Tidak ada baris item untuk dicocokkan.
        if total is None:
            raise AgentHttpError(
                "UNREADABLE_FILE",
                "Berkas tidak terbaca: tidak ada isi invoice yang dapat dikenali setelah 2 kali percobaan.",
            )
        finding = Finding(
            summary="Total invoice terbaca, tetapi baris item tidak dapat dikenali, sehingga pencocokan per baris tidak dapat dilakukan.",
            recommendation="Periksa dokumen asli dan unggah ulang bila perlu.",
            confidence=0.5,
            labels=[Label(type="FACT", text="Baris item tidak terbaca pada dokumen.")],
            evidence=[_invoice_evidence(res, invoice_number, total)],
        )
        return AgentResult(
            invoice=invoice_info, verdict="NEEDS_REVIEW", confidence=0.5,
            difference_amount=None, iterations=0,
            review_reason="Baris item invoice tidak terbaca",
            extraction=extraction, comparison=None, tax_check=tax, duplicate=None,
            investigation=None, finding=finding,
        )

    results, comp = _build_comparison(res, po, req.settings.price_tolerance_pct)
    difference = comp.totals.difference

    # Field kunci dengan keyakinan rendah → langsung NEEDS_REVIEW
    low = _low_confidence_fields(res)
    min_conf = min((f.confidence for f in res.fields), default=0.5)
    if low:
        finding = Finding(
            summary="Beberapa field kunci terbaca dengan keyakinan rendah, sehingga hasil pencocokan belum dapat dipercaya penuh.",
            recommendation="Periksa kembali dokumen asli sebelum memutuskan.",
            confidence=round(min_conf, 2),
            labels=[Label(type="FACT", text=f"Field berkeyakinan rendah: {', '.join(low)}.")],
            evidence=[_invoice_evidence(res, invoice_number, total)],
        )
        return AgentResult(
            invoice=invoice_info, verdict="NEEDS_REVIEW", confidence=round(min_conf, 2),
            difference_amount=difference, iterations=0,
            review_reason=f"Keyakinan rendah pada field: {', '.join(low)}",
            extraction=extraction, comparison=comp, tax_check=tax, duplicate=None,
            investigation=None, finding=finding,
        )

    # 5. Investigasi bila ada selisih di luar toleransi
    if not has_out_of_tolerance(results):
        finding = None
        investigation = None
        iterations = 0
        verdict = "CLEAN"
        confidence = round(min(min_conf, 0.98), 2)
        return AgentResult(
            invoice=invoice_info, verdict=verdict, confidence=confidence,
            difference_amount=difference, iterations=iterations, review_reason=None,
            extraction=extraction, comparison=comp, tax_check=tax, duplicate=None,
            investigation=investigation, finding=finding,
        )

    inv_result = investigate(
        results, po, vendor, invoice_number, total, req.settings.max_iterations
    )
    # Keyakinan temuan: dukungan bukti (tool menghasilkan data nyata) x keyakinan bacaan.
    confidence = round(min(min_conf, 0.9), 2)

    # 6. Temuan
    mismatched = [r for r in results if r.status == "MISMATCH"]
    parts = []
    evidence: list[Evidence] = []
    labels: list[Label] = []
    for r in mismatched:
        for d in r.diffs:
            if d.within_tolerance:
                continue
            if d.type == "PRICE":
                parts.append(
                    f"Invoice menagih {r.item_name} {fmt_rupiah(d.actual)} padahal PO {fmt_rupiah(d.expected)}"
                )
                if po:
                    ev = _po_evidence(po, r.item_name)
                    if ev:
                        evidence.append(ev)
            elif d.type == "QUANTITY":
                parts.append(
                    f"menagih {d.actual} {r.item_name} padahal hanya {d.expected} yang diterima"
                )
                if po:
                    ev = _grn_evidence(po, r.item_name)
                    if ev:
                        evidence.append(ev)
            elif d.type == "ITEM":
                parts.append(f"ada baris {r.item_name} {fmt_rupiah(d.actual)} yang tidak ada di PO")
                ev = _invoice_evidence(res, invoice_number, None)
                if ev:
                    evidence.append(ev)
    summary = " dan ".join(parts)
    if difference:
        summary += f". Selisih total {fmt_rupiah(difference)}."
    else:
        summary += "."
    summary = summary[0].upper() + summary[1:]

    labels.append(Label(type="FACT", text=f"{len([r for r in mismatched])} baris dengan selisih di luar toleransi."))
    contract_ev = _contract_evidence(vendor, po) if vendor else None
    if any(d.type == "PRICE" for r in mismatched for d in r.diffs):
        labels.append(Label(type="HYPOTHESIS", text="Kenaikan harga tanpa persetujuan tertulis."))
        if contract_ev:
            evidence.append(contract_ev)
    elif any(d.type == "ITEM" for r in mismatched for d in r.diffs):
        labels.append(Label(type="HYPOTHESIS", text="Baris dipesan lewat jalur lain di luar PO."))

    if not evidence:
        ev = _invoice_evidence(res, invoice_number, total)
        if ev:
            evidence.append(ev)

    if confidence >= req.settings.confidence_threshold:
        verdict = "EXCEPTION"
        recommendation = (
            "Tolak dan minta vendor menerbitkan koreksi invoice."
            if any(d.type in ("PRICE", "ITEM") for r in mismatched for d in r.diffs if not d.within_tolerance)
            else "Tolak baris yang melebihi jumlah penerimaan; minta penerbitan koreksi."
        )
        review_reason = None
    else:
        verdict = "NEEDS_REVIEW"
        recommendation = "Periksa manual; keyakinan temuan di bawah ambang."
        review_reason = f"Keyakinan rendah ({confidence:.2f})"

    finding = Finding(
        summary=summary, recommendation=recommendation, confidence=confidence,
        labels=labels, evidence=evidence[:5],
    )
    return AgentResult(
        invoice=invoice_info, verdict=verdict, confidence=confidence,
        difference_amount=difference, iterations=len(inv_result.steps),
        review_reason=review_reason, extraction=extraction, comparison=comp,
        tax_check=tax, duplicate=None,
        investigation=Investigation(
            iterations=len(inv_result.steps),
            max_iterations=req.settings.max_iterations,
            steps=[
                InvestigationStep(
                    step=i + 1, hypothesis=s.hypothesis, tool=s.tool,
                    tool_args_summary=s.tool_args_summary,
                    result_summary=s.result_summary, duration_ms=s.duration_ms,
                )
                for i, s in enumerate(inv_result.steps)
            ],
        ),
        finding=finding,
    )
