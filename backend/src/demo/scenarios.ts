/**
 * Isi invoice contoh untuk demo. Angka dihitung dari data master seed
 * (backend/src/seed/master-data.ts) supaya agent asli benar-benar mencocokkan
 * isi dokumen, bukan menebak dari nama berkas.
 *
 * Skenario tiap berkas:
 * - clean     : semua baris cocok PO + GRN → CLEAN
 * - exception : harga naik / jumlah melebihi penerimaan → EXCEPTION
 * - review    : merujuk PO yang tidak ada di master → NEEDS_REVIEW
 * - gagal     : berkas bukan PDF valid → 422 → FAILED
 */

export interface DemoFile {
  name: string;
  lines: string[];
}

interface InvLine {
  name: string;
  qty: number;
  price: number;
}

interface Scenario {
  vendor: string;
  vendorName: string;
  npwp: string;
  po: string;
  date: string;
  lines: InvLine[];
  /** Nomor invoice tetap (dipakai contoh duplikat); selain itu dibangkitkan. */
  fixedNumber?: string;
}

const VEN = {
  ven001: { vendor: 'ven_001', vendorName: 'PT Maju Jaya Abadi', npwp: '01.111.111.1-001.000' },
  ven002: { vendor: 'ven_002', vendorName: 'CV Maju Jaya', npwp: '01.222.222.2-002.000' },
  ven003: { vendor: 'ven_003', vendorName: 'PT Sinar Kertas Nusantara', npwp: '01.234.567.8-901.000' },
  ven004: { vendor: 'ven_004', vendorName: 'UD Berkah Teknik', npwp: '02.345.678.9-012.000' },
};

// Nomor invoice "asli" untuk contoh duplikat. Disimpan di seed agar selalu terdeteksi.
export const DUPLICATE_ORIGINAL = { number: 'INV-2026-0777', vendor: 'ven_001', total: 3250000, date: '2026-10-27' };

const SCENARIOS: Record<string, Scenario> = {
  clean1: {
    ...VEN.ven001, po: 'PO-0008', date: '2026-10-27',
    lines: [
      { name: 'Kertas HVS F4 (rim)', qty: 25, price: 55000 },
      { name: 'Pulpen gel hitam (lusin)', qty: 50, price: 37500 },
    ],
  },
  clean5: {
    ...VEN.ven002, po: 'PO-0015', date: '2026-10-28',
    lines: [{ name: 'Toner printer', qty: 4, price: 1120000 }],
  },
  exc1: {
    ...VEN.ven003, po: 'PO-0012', date: '2026-10-28',
    lines: [
      { name: 'Kertas A4 80gr (rim)', qty: 100, price: 62000 }, // PO 58.000 → selisih harga
      { name: 'Map folder', qty: 50, price: 7500 },
      { name: 'Tinta printer', qty: 8, price: 120000 }, // sesuai yang diterima
    ],
  },
  exc2: {
    ...VEN.ven003, po: 'PO-0012', date: '2026-10-29',
    lines: [
      { name: 'Kertas A4 80gr (rim)', qty: 100, price: 58000 },
      { name: 'Map folder', qty: 50, price: 7500 },
      { name: 'Tinta printer', qty: 10, price: 120000 }, // diterima hanya 8 → selisih jumlah
    ],
  },
  review: {
    ...VEN.ven004, po: 'PO-9999', date: '2026-10-30',
    lines: [{ name: 'Kabel LAN Cat6 (roll)', qty: 10, price: 380000 }],
  },
  dupe: {
    ...VEN.ven001, po: 'PO-0008', date: DUPLICATE_ORIGINAL.date,
    fixedNumber: DUPLICATE_ORIGINAL.number,
    lines: [
      { name: 'Kertas HVS F4 (rim)', qty: 25, price: 55000 },
      { name: 'Pulpen gel hitam (lusin)', qty: 50, price: 37500 },
    ],
  },
};

/** Baris teks PDF untuk satu skenario. */
function invoiceLines(s: Scenario, invoiceNumber: string): string[] {
  const out = [
    'INVOICE',
    `Vendor : ${s.vendorName}`,
    `No. Invoice : ${invoiceNumber}`,
    `Ref. PO : ${s.po}`,
    `Invoice Date : ${s.date}`,
    `NPWP : ${s.npwp}`,
  ];
  let subtotal = 0;
  s.lines.forEach((l, i) => {
    out.push(`${i + 1}. ${l.name} | qty ${l.qty} | unit ${l.price}`);
    subtotal += l.qty * l.price;
  });
  out.push(`Subtotal : Rp ${subtotal}`);
  out.push(`PPN 11% : Rp ${Math.round(subtotal * 0.11)}`);
  out.push(`Total : Rp ${subtotal}`);
  return out;
}

/** Pdf rusak: header benar agar lolos pemeriksaan tipe BE, isi tidak terbaca. */
export function brokenPdf(): Buffer {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n', 'latin1');
}

/** Daftar berkas contoh: nama + baris teks PDF-nya. */
export function sampleScenarios(nonce: string): DemoFile[] {
  const num = (tag: string) => `INV-DEMO-${nonce}-${tag}`.toUpperCase();
  // Tanggal berbeda per berkas: aturan duplikat memakai vendor+total+tanggal,
  // jadi tanggal sama akan membuat invoice sehat ikut tertandai duplikat.
  const withDate = (s: Scenario, date: string): Scenario => ({ ...s, date });
  return [
    { name: 'demo_clean_01.pdf', lines: invoiceLines(withDate(SCENARIOS.clean1, '2026-11-07'), num('C1')) },
    { name: 'demo_clean_02.pdf', lines: invoiceLines(withDate(SCENARIOS.clean1, '2026-11-02'), num('C2')) },
    { name: 'demo_clean_03.pdf', lines: invoiceLines(withDate(SCENARIOS.clean1, '2026-11-05'), num('C3')) },
    { name: 'demo_clean_04.pdf', lines: invoiceLines(withDate(SCENARIOS.clean5, '2026-10-28'), num('C4')) },
    { name: 'demo_clean_05.pdf', lines: invoiceLines(withDate(SCENARIOS.clean5, '2026-11-03'), num('C5')) },
    { name: 'demo_clean_06.pdf', lines: invoiceLines(withDate(SCENARIOS.clean5, '2026-11-06'), num('C6')) },
    { name: 'demo_exception_01.pdf', lines: invoiceLines(withDate(SCENARIOS.exc1, '2026-10-28'), num('E1')) },
    { name: 'demo_exception_02.pdf', lines: invoiceLines(withDate(SCENARIOS.exc2, '2026-10-29'), num('E2')) },
    { name: 'demo_exception_03.pdf', lines: invoiceLines(withDate(SCENARIOS.exc1, '2026-11-04'), num('E3')) },
    { name: 'demo_review_01.pdf', lines: invoiceLines(withDate(SCENARIOS.review, '2026-10-30'), num('R1')) },
    { name: 'demo_gagal_01.pdf', lines: [] }, // ditangani terpisah (pdf rusak)
    { name: 'demo_duplicate_01.pdf', lines: invoiceLines(SCENARIOS.dupe, SCENARIOS.dupe.fixedNumber!) },
  ];
}
