"""Uji pipeline end-to-end tanpa HTTP: bikin PDF sintetis, jalankan pipeline.run.

Butuh PostgreSQL berjalan dengan data seed BE (vendor, PO, GRN). Bila database
tidak dapat dijangkau, seluruh uji di berkas ini dilewati.
"""
import base64
import uuid

import pytest

from app import db
from app.pipeline import run
from app.schemas import ProcessRequest, Settings


def _make_pdf(lines: list[str]) -> bytes:
    """PDF satu halaman sederhana (sama seperti backend/src/demo/pdf.ts)."""
    def esc(s: str) -> str:
        out = s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        return "".join(c if 0x20 <= ord(c) <= 0x7E else "?" for c in out)

    stream = "\n".join(["BT", "/F1 12 Tf", "50 780 Td", "16 TL"] + [f"({esc(l)}) Tj T*" for l in lines] + ["ET"])
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = "%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs):
        offsets.append(len(out.encode("latin-1")))
        out += f"{i + 1} 0 obj\n{o}\nendobj\n"
    xref = len(out.encode("latin-1"))
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n"
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")


def _invoice_lines(no: str, vendor: str, po: str, date: str, npwp: str, items: list[tuple]) -> list[str]:
    lines = [
        "INVOICE",
        f"Vendor : {vendor}",
        f"No. Invoice : {no}",
        f"Ref. PO : {po}",
        f"Invoice Date : {date}",
        f"NPWP : {npwp}",
    ]
    subtotal = 0
    for i, (name, qty, price) in enumerate(items, 1):
        lines.append(f"{i}. {name} | qty {qty} | unit {price}")
        subtotal += qty * price
    lines.append(f"Subtotal : Rp {subtotal}")
    lines.append(f"PPN 11% : Rp {round(subtotal * 0.11)}")
    lines.append(f"Total : Rp {subtotal}")
    return lines


def _req(name: str, lines: list[str], invoice_id: str = "inv_test_1") -> ProcessRequest:
    return ProcessRequest(
        invoice_id=invoice_id,
        file_name=name,
        content_type="application/pdf",
        file_base64=base64.b64encode(_make_pdf(lines)).decode(),
        settings=Settings(price_tolerance_pct=0.5, confidence_threshold=0.7, max_iterations=3),
    )


def _unique(tag: str) -> tuple[str, str]:
    """Nomor invoice + tanggal unik agar tidak tertangkap sebagai duplikat
    (aturan duplikat: nomor+vendor, atau vendor+total+tanggal)."""
    h = uuid.uuid4().hex[:8]
    return f"{tag}-{h.upper()}", f"2026-{int(h[0:2], 16) % 12 + 1:02d}-{int(h[2:4], 16) % 28 + 1:02d}"


@pytest.fixture(scope="module", autouse=True)
def _skip_without_db():
    try:
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM vendors")
            assert cur.fetchone()[0] > 0
    except Exception as e:  # pragma: no cover
        pytest.skip(f"database tidak tersedia: {e}")


def test_clean_po_0008():
    inv_no, inv_date = _unique("INV-TEST-CLEAN")
    req = _req(
        "demo_clean_01.pdf",
        _invoice_lines(
            inv_no, "PT Maju Jaya Abadi", "PO-0008", inv_date, "01.111.111.1-001.000",
            [("Kertas HVS F4 (rim)", 25, 55000), ("Pulpen gel hitam (lusin)", 50, 37500)],
        ),
    )
    r = run(req)
    assert r.verdict == "CLEAN"
    assert r.difference_amount == 0
    assert r.invoice.vendor_id == "ven_001"
    assert r.invoice.total_amount == 3250000
    assert r.comparison is not None and all(l.status == "MATCH" for l in r.comparison.lines)


def test_exception_po_0012():
    inv_no, inv_date = _unique("INV-TEST-EXC")
    req = _req(
        "demo_exception_03.pdf",
        _invoice_lines(
            inv_no, "PT Sinar Kertas Nusantara", "PO-0012", inv_date, "01.234.567.8-901.000",
            [("Kertas A4 80gr (rim)", 100, 62000), ("Map folder", 50, 7500), ("Tinta printer", 10, 120000)],
        ),
    )
    r = run(req)
    assert r.verdict == "EXCEPTION"
    assert r.difference_amount == 640000
    assert r.investigation is not None and len(r.investigation.steps) >= 1
    assert r.finding is not None and r.finding.evidence
    assert any(e.source_type in ("PO", "GRN", "CONTRACT") for e in r.finding.evidence)


def test_po_tidak_ditemukan():
    req = _req(
        "demo_review_01.pdf",
        _invoice_lines(
            "INV-TEST-PO9999", "UD Berkah Teknik", "PO-9999", "2026-10-30", "02.345.678.9-012.000",
            [("Kabel LAN Cat6 (roll)", 10, 380000)],
        ),
    )
    r = run(req)
    assert r.verdict == "NEEDS_REVIEW"
    assert r.comparison is None
    assert r.review_reason and "PO-9999" in r.review_reason


def test_berkas_rusak_422():
    from app.errors import AgentHttpError

    req = ProcessRequest(
        invoice_id="inv_bad",
        file_name="demo_gagal_01.pdf",
        content_type="application/pdf",
        file_base64=base64.b64encode(b"bukan pdf sama sekali").decode(),
        settings=Settings(price_tolerance_pct=0.5, confidence_threshold=0.7, max_iterations=3),
    )
    with pytest.raises(AgentHttpError) as e:
        run(req)
    assert e.value.code == "UNREADABLE_FILE"
    assert e.value.status == 422
