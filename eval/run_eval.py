"""Evaluasi 50 invoice sintetis untuk AURA (M5).

Membuat 50 invoice berlabel dari data master seed BE, menjalankannya lewat
agent (POST /process), lalu menghitung akurasi verdict dan selisih.

Pakai:
    python eval/run_eval.py                  # agent di localhost:8000
    python eval/run_eval.py --base http://localhost:8000

Keluaran:
    eval/eval-label.csv    tabel label yang dipakai
    eval/eval-result.csv   hasil per invoice (verdict agent vs label)
    eval/eval-summary.md   ringkasan angka untuk proposal
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_LABEL = ROOT / "eval-label.csv"
OUT_RESULT = ROOT / "eval-result.csv"
OUT_SUMMARY = ROOT / "eval-summary.md"

# Data master master-data.ts (vendor, item, PO, GRN). Dijaga sinkron dengan seed BE.
VENDORS = {
    "ven_001": ("PT Maju Jaya Abadi", "01.111.111.1-001.000"),
    "ven_002": ("CV Maju Jaya", "01.222.222.2-002.000"),
    "ven_003": ("PT Sinar Kertas Nusantara", "01.234.567.8-901.000"),
    "ven_004": ("UD Berkah Teknik", "02.345.678.9-012.000"),
    "ven_005": ("PT Cahaya Logistik", "03.456.789.0-123.000"),
}

ITEMS = {
    "itm_001": "Kertas A4 80gr (rim)",
    "itm_002": "Map folder",
    "itm_003": "Tinta printer",
    "itm_004": "Kertas HVS F4 (rim)",
    "itm_005": "Pulpen gel hitam (lusin)",
    "itm_006": "Kabel LAN Cat6 (roll)",
    "itm_007": "Toner printer",
    "itm_008": "Konektor RJ45 (box)",
}

# po_number -> (vendor, [(item, qty_po, harga_po)], grn, [(item, qty_diterima)])
POS: dict[str, tuple] = {
    "PO-0021": ("ven_001", [("itm_001", 40, 57500), ("itm_004", 30, 55000)], "GRN-0102", {"itm_001": 40, "itm_004": 30}),
    "PO-0022": ("ven_002", [("itm_007", 6, 1110000)], "GRN-0103", {"itm_007": 6}),
    "PO-0023": ("ven_003", [("itm_002", 120, 7400), ("itm_003", 15, 118000)], "GRN-0104", {"itm_002": 120, "itm_003": 15}),
    "PO-0024": ("ven_004", [("itm_006", 20, 375000), ("itm_008", 5, 98000)], "GRN-0105", {"itm_006": 20, "itm_008": 5}),
    "PO-0025": ("ven_005", [("itm_006", 8, 385000)], "GRN-0106", {"itm_006": 8}),
    "PO-0026": ("ven_001", [("itm_005", 80, 37000)], "GRN-0107", {"itm_005": 75}),
    "PO-0027": ("ven_002", [("itm_001", 60, 58000), ("itm_002", 40, 7500)], "GRN-0108", {"itm_001": 60, "itm_002": 40}),
    "PO-0028": ("ven_003", [("itm_004", 45, 54500)], "GRN-0109", {"itm_004": 45}),
    "PO-0029": ("ven_004", [("itm_003", 25, 119000), ("itm_007", 3, 1130000)], "GRN-0110", {"itm_003": 22, "itm_007": 3}),
    "PO-0030": ("ven_005", [("itm_008", 10, 99000), ("itm_006", 12, 380000)], "GRN-0111", {"itm_008": 10, "itm_006": 12}),
    "PO-0031": ("ven_001", [("itm_001", 90, 57200), ("itm_003", 18, 118500)], "GRN-0112", {"itm_001": 90, "itm_003": 18}),
    "PO-0032": ("ven_002", [("itm_004", 55, 55200)], "GRN-0113", {"itm_004": 55}),
    "PO-0033": ("ven_003", [("itm_005", 100, 37200), ("itm_002", 70, 7450)], "GRN-0114", {"itm_005": 100, "itm_002": 65}),
    "PO-0034": ("ven_004", [("itm_007", 5, 1120000)], "GRN-0115", {"itm_007": 5}),
    "PO-0035": ("ven_005", [("itm_001", 75, 58100), ("itm_006", 15, 378000)], "GRN-0116", {"itm_001": 75, "itm_006": 15}),
    "PO-0036": ("ven_001", [("itm_008", 8, 101000)], "GRN-0117", {"itm_008": 8}),
}


@dataclass
class Case:
    file_name: str
    po: str
    expect_verdict: str
    expect_difference: int | None
    note: str
    vendor: str = ""
    date: str = "2026-11-05"
    lines: list[tuple] = field(default_factory=list)  # (item, qty, harga) sesuai yang ditagih


def make_pdf(lines: list[str]) -> bytes:
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
    offs = []
    for i, o in enumerate(objs):
        offs.append(len(out.encode("latin-1")))
        out += f"{i + 1} 0 obj\n{o}\nendobj\n"
    xref = len(out.encode("latin-1"))
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n"
    for off in offs:
        out += f"{off:010d} 00000 n \n"
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")


def invoice_text(c: Case, number: str) -> list[str]:
    vname, npwp = VENDORS[c.vendor]
    out = [
        "INVOICE",
        f"Vendor : {vname}",
        f"No. Invoice : {number}",
        f"Ref. PO : {c.po}",
        f"Invoice Date : {c.date}",
        f"NPWP : {npwp}",
    ]
    sub = 0
    for i, (item, qty, price) in enumerate(c.lines, 1):
        out.append(f"{i}. {ITEMS[item]} | qty {qty} | unit {price}")
        sub += qty * price
    out += [f"Subtotal : Rp {sub}", f"PPN 11% : Rp {round(sub * 0.11)}", f"Total : Rp {sub}"]
    return out


def build_cases() -> list[Case]:
    cases: list[Case] = []
    pos = list(POS.items())
    n = 0

    def nxt() -> str:
        nonlocal n
        n += 1
        return f"EVAL-{n:03d}"

    duplicate_source: Case | None = None

    # 30 CLEAN: semua baris cocok PO + GRN
    for i in range(30):
        po_no, (vendor, lines, grn, received) = pos[i % len(pos)]
        bill = [(item, received.get(item, qty), price) for item, qty, price in lines]
        c = Case(f"eval_{nxt()}_clean.pdf", po_no, "CLEAN", 0, "Semua baris cocok PO dan GRN", vendor, lines=bill)
        cases.append(c)

    # 12 EXCEPTION harga: harga naik 3-8%
    for i in range(12):
        po_no, (vendor, lines, grn, received) = pos[(i + 3) % len(pos)]
        item, qty_po, price = lines[0]
        naik = max(1, round(price * (0.03 + 0.05 * (i % 2))))
        bill = [(item, received.get(item, qty_po), price + naik)]
        for it, q, p in lines[1:]:
            bill.append((it, received.get(it, q), p))
        c = Case(f"eval_{nxt()}_harga_naik.pdf", po_no, "EXCEPTION", None,
                 f"Harga {item} naik {naik} di atas toleransi 0,5%", vendor, lines=bill)
        cases.append(c)

    # 4 EXCEPTION jumlah: menagih lebih dari yang diterima GRN
    for i in range(4):
        po_no, (vendor, lines, grn, received) = pos[(i * 4 + 5) % len(pos)]
        item, qty_po, price = lines[0]
        billed_qty = received.get(item, qty_po) + 3
        bill = [(item, billed_qty, price)]
        for it, q, p in lines[1:]:
            bill.append((it, received.get(it, q), p))
        c = Case(f"eval_{nxt()}_jumlah_lebih.pdf", po_no, "EXCEPTION", None,
                 f"Menagih {billed_qty} {item}, diterima {received.get(item, qty_po)}", vendor, lines=bill)
        cases.append(c)

    # 3 NEEDS_REVIEW: PO tidak ada di master
    for i in range(3):
        c = Case(f"eval_{nxt()}_po_tidak_ada.pdf", f"PO-99{i:02d}", "NEEDS_REVIEW", None,
                 "PO tidak ada di data master", "ven_004",
                 lines=[("itm_006", 5, 380000)])
        cases.append(c)

    # 1 DUPLICATE: nomor + vendor + total + tanggal sama dengan invoice pertama
    if cases:
        src = cases[0]
        dup = Case(f"eval_{nxt()}_duplikat.pdf", src.po, "DUPLICATE", None,
                   "Nomor, vendor, dan total sama dengan invoice yang sudah ada",
                   src.vendor, date=src.date, lines=src.lines)
        cases.append(dup)
        duplicate_source = src

    return cases


def call_agent(base: str, req: dict, timeout: int = 120) -> tuple[int, dict]:
    body = json.dumps(req).encode()
    r = urllib.request.Request(f"{base}/process", data=body,
                               headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:200].decode(errors="replace")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    cases = build_cases()
    if args.limit:
        cases = cases[: args.limit]
    print(f"Menjalankan {len(cases)} invoice ke {args.base}\n")

    # Tulis label dulu (bisa dipakai proposal walau agent belum jalan).
    with OUT_LABEL.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file_name", "verdict_benar", "po_number", "selisih_benar", "catatan"])
        for c in cases:
            w.writerow([c.file_name, c.expect_verdict, c.po,
                        "" if c.expect_difference is None else c.expect_difference, c.note])
    print(f"Label ditulis: {OUT_LABEL}")

    rows = []
    for i, c in enumerate(cases, 1):
        number = f"INV-{c.file_name.split('_')[1]}-{i:03d}"
        if c.expect_verdict == "DUPLICATE":
            number = f"INV-{cases[0].file_name.split('_')[1]}-001"  # samakan dengan invoice pertama
        req = {
            "invoice_id": f"eval_{i:03d}",
            "file_name": c.file_name,
            "content_type": "application/pdf",
            "file_base64": __import__("base64").b64encode(make_pdf(invoice_text(c, number))).decode(),
            "settings": {"price_tolerance_pct": 0.5, "confidence_threshold": 0.7, "max_iterations": 3},
        }
        status, res = call_agent(args.base, req)
        got = res.get("verdict", "ERROR") if status == 200 else "ERROR"
        diff = res.get("difference_amount") if status == 200 else None
        conf = res.get("confidence") if status == 200 else None
        ok = got == c.expect_verdict
        rows.append({
            "file_name": c.file_name, "harap": c.expect_verdict, "dapat": got,
            "status_http": status, "cocok": "YA" if ok else "TIDAK",
            "confidence": conf, "selisih": diff,
            "po": res.get("invoice", {}).get("po_number") if status == 200 else None,
            "review_reason": (res.get("review_reason") or "")[:70] if status == 200 else str(res)[:70],
            "catatan": c.note,
        })
        mark = "OK " if ok else "SALAH"
        print(f"  [{i:2d}/{len(cases)}] {mark} {c.file_name:34s} harap={c.expect_verdict:13s} dapat={got}")

    with OUT_RESULT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    total = len(rows)
    benar = sum(1 for r in rows if r["cocok"] == "YA")
    per: dict[str, list[int]] = {}
    for r in rows:
        per.setdefault(r["harap"], [0, 0])
        per[r["harap"]][1] += 1
        if r["cocok"] == "YA":
            per[r["harap"]][0] += 1

    exc_exp = sum(1 for r in rows if r["harap"] == "EXCEPTION")
    exc_ok = sum(1 for r in rows if r["harap"] == "EXCEPTION" and r["cocok"] == "YA")
    clean_exp = sum(1 for r in rows if r["harap"] == "CLEAN")
    false_alarm = sum(1 for r in rows if r["harap"] == "CLEAN" and r["dapat"] == "EXCEPTION")

    with OUT_SUMMARY.open("w", encoding="utf-8") as f:
        f.write("# Hasil evaluasi AURA (50 invoice sintetis)\n\n")
        f.write(f"- Tanggal: dijalankan otomatis oleh `eval/run_eval.py`\n")
        f.write(f"- Total invoice: **{total}**\n")
        f.write(f"- Akurasi verdict: **{benar}/{total} = {benar/total*100:.1f}%**\n")
        f.write(f"- Recall EXCEPTION: **{exc_ok}/{exc_exp} = {(exc_ok/exc_exp*100) if exc_exp else 0:.1f}%**\n")
        f.write(f"- Alarm palsu (CLEAN dituduh EXCEPTION): **{false_alarm}/{clean_exp}**\n\n")
        f.write("| Kategori | Benar | Total | Akurasi |\n|---|---|---|---|\n")
        for k in sorted(per):
            a, b = per[k]
            f.write(f"| {k} | {a} | {b} | {a/b*100:.1f}% |\n")
        f.write("\n## Rincian yang salah\n\n")
        salah = [r for r in rows if r["cocok"] == "TIDAK"]
        if salah:
            f.write("| Berkas | Harap | Dapat | Alasan |\n|---|---|---|---|\n")
            for r in salah:
                f.write(f"| {r['file_name']} | {r['harap']} | {r['dapat']} | {r['review_reason']} |\n")
        else:
            f.write("Tidak ada.\n")

    print(f"\nAkurasi: {benar}/{total} = {benar/total*100:.1f}%")
    print(f"Recall EXCEPTION: {exc_ok}/{exc_exp}")
    print(f"Ringkasan: {OUT_SUMMARY}")
    print(f"Hasil: {OUT_RESULT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
