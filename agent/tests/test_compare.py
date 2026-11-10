"""Uji hitungan deterministik pencocokan 3 arah.

Angka acuan: docs/ai/examples/response_2 (PO-0012, selisih Rp 640.000).
"""
from app.compare import compare, fmt_rupiah, has_out_of_tolerance, totals
from app.extract import ExtractionResult, InvLine
from app.tools import PoDetail, PoLineInfo

TOL = 0.5

PO_0012 = PoDetail(
    po_number="PO-0012",
    po_date="2026-10-20",
    vendor_id="ven_003",
    vendor_name="PT Sinar Kertas Nusantara",
    lines=[
        PoLineInfo("itm_001", "Kertas A4 80gr (rim)", "rim", 100, 58000, 100),
        PoLineInfo("itm_002", "Map folder", "pcs", 50, 7500, 50),
        PoLineInfo("itm_003", "Tinta printer", "botol", 10, 120000, 8),
    ],
    grn_number="GRN-0087",
    grn_date="2026-10-25",
)


def _inv(lines, total=None) -> ExtractionResult:
    return ExtractionResult(
        lines=[InvLine(name=n, quantity=q, unit_price=p) for n, q, p in lines],
        total=total,
    )


def test_contoh_2_selisih_640000():
    """Persis seperti response_2: harga naik + jumlah lebih → Rp 640.000."""
    res = _inv(
        [
            ("Kertas A4 80gr (rim)", 100, 62000),
            ("Map folder", 50, 7500),
            ("Tinta printer", 10, 120000),
        ],
        total=7775000,
    )
    results = compare(res, PO_0012, TOL)
    t = totals(results, PO_0012, res)
    assert t["po_total"] == 7375000
    assert t["grn_total_at_po_price"] == 7135000
    assert t["invoice_total"] == 7775000
    assert t["difference"] == 640000
    assert has_out_of_tolerance(results)

    price = next(d for r in results for d in r.diffs if d.type == "PRICE")
    assert (price.expected, price.actual, price.delta) == (58000, 62000, 4000)
    assert price.delta_pct == 6.9
    assert price.within_tolerance is False

    qty = next(d for r in results for d in r.diffs if d.type == "QUANTITY")
    assert (qty.expected, qty.actual, qty.delta) == (8, 10, 2)
    assert qty.delta_pct == 25.0
    assert qty.within_tolerance is False

    assert [r.status for r in results] == ["MISMATCH", "MATCH", "MISMATCH"]


def test_harga_saja_selisih_400000():
    """Hanya harga naik, jumlah ditagih sesuai yang diterima → Rp 400.000."""
    res = _inv(
        [
            ("Kertas A4 80gr (rim)", 100, 62000),
            ("Map folder", 50, 7500),
            ("Tinta printer", 8, 120000),
        ],
        total=7535000,
    )
    t = totals(compare(res, PO_0012, TOL), PO_0012, res)
    assert t["difference"] == 400000
    assert t["invoice_total"] == 7535000


def test_jumlah_saja_selisih_240000():
    """Hanya jumlah tinta berlebih → Rp 240.000."""
    res = _inv(
        [
            ("Kertas A4 80gr (rim)", 100, 58000),
            ("Map folder", 50, 7500),
            ("Tinta printer", 10, 120000),
        ],
        total=7375000,
    )
    t = totals(compare(res, PO_0012, TOL), PO_0012, res)
    assert t["difference"] == 240000


def test_bersih_difference_nol():
    """Semua cocok dengan PO dan GRN → CLEAN, selisih 0."""
    res = _inv(
        [
            ("Kertas A4 80gr (rim)", 100, 58000),
            ("Map folder", 50, 7500),
            ("Tinta printer", 8, 120000),
        ],
        total=7135000,
    )
    results = compare(res, PO_0012, TOL)
    t = totals(results, PO_0012, res)
    assert t["difference"] == 0
    assert not has_out_of_tolerance(results)
    assert all(r.status == "MATCH" for r in results)


def test_baris_di_luar_po():
    """Baris jasa tidak ada di PO → diff ITEM, expected 0."""
    res = _inv(
        [
            ("Kabel LAN Cat6 (roll)", 10, 380000),
            ("Jasa instalasi tambahan", 1, 1200000),
        ],
        total=5000000,
    )
    po = PoDetail(
        "PO-0019", "2026-10-24", "ven_004", "UD Berkah Teknik",
        [PoLineInfo("itm_006", "Kabel LAN Cat6 (roll)", "roll", 10, 380000, 10)],
        "GRN-0099", "2026-10-29",
    )
    results = compare(res, po, TOL)
    item = next(d for r in results for d in r.diffs if d.type == "ITEM")
    assert (item.expected, item.actual, item.delta) == (0, 1200000, 1200000)
    assert item.delta_pct is None
    assert item.within_tolerance is False


def test_rupiah_format():
    assert fmt_rupiah(640000) == "Rp 640.000"
    assert fmt_rupiah(7775000) == "Rp 7.775.000"
