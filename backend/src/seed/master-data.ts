import * as bcrypt from 'bcryptjs';
import { EntityManager } from 'typeorm';
import { Role } from '../common/enums';
import { GoodsReceipt, GrnLine, Item, PoLine, PurchaseOrder, Setting, User, Vendor } from '../database/entities';

/** SEMUA DATA DI SINI SINTETIS. Tidak ada data perusahaan atau NPWP nyata. */

const VENDORS: Partial<Vendor>[] = [
  { id: 'ven_001', name: 'PT Maju Jaya Abadi', npwp: '01.111.111.1-001.000', paymentTermsDays: 30, hasContract: false, contractText: null },
  { id: 'ven_002', name: 'CV Maju Jaya', npwp: '01.222.222.2-002.000', paymentTermsDays: 14, hasContract: false, contractText: null },
  {
    id: 'ven_003', name: 'PT Sinar Kertas Nusantara', npwp: '01.234.567.8-901.000', paymentTermsDays: 30, hasContract: true,
    contractText: 'Pasal 4.2: Perubahan harga wajib diberitahukan secara tertulis kepada pembeli paling lambat 30 hari sebelum berlaku.',
  },
  { id: 'ven_004', name: 'UD Berkah Teknik', npwp: '02.345.678.9-012.000', paymentTermsDays: 14, hasContract: false, contractText: null },
  { id: 'ven_005', name: 'PT Cahaya Logistik', npwp: '03.456.789.0-123.000', paymentTermsDays: 45, hasContract: true,
    contractText: 'Pasal 2.1: Harga jasa pengiriman tetap selama 12 bulan sejak penandatanganan.' },
];

const ITEMS: Partial<Item>[] = [
  { id: 'itm_001', sku: 'ATK-A4-80', name: 'Kertas A4 80gr (rim)', unit: 'rim' },
  { id: 'itm_002', sku: 'ATK-MAP', name: 'Map folder', unit: 'pcs' },
  { id: 'itm_003', sku: 'ATK-TINTA', name: 'Tinta printer', unit: 'botol' },
  { id: 'itm_004', sku: 'ATK-F4', name: 'Kertas HVS F4 (rim)', unit: 'rim' },
  { id: 'itm_005', sku: 'ATK-PULPEN', name: 'Pulpen gel hitam (lusin)', unit: 'lusin' },
  { id: 'itm_006', sku: 'IT-LAN6', name: 'Kabel LAN Cat6 (roll)', unit: 'roll' },
  { id: 'itm_007', sku: 'IT-TONER', name: 'Toner printer', unit: 'pcs' },
  { id: 'itm_008', sku: 'IT-RJ45', name: 'Konektor RJ45 (box)', unit: 'box' },
];

// [po_number, po_date, vendor, [ [item, qty, harga] ... ], grn_number, grn_date, [ [item, qty_diterima] ... ]]
const PURCHASES: [string, string, string, [string, number, number][], string, string, [string, number][]][] = [
  ['PO-0008', '2026-10-15', 'ven_001', [['itm_004', 25, 55000], ['itm_005', 50, 37500]], 'GRN-0060', '2026-10-22', [['itm_004', 25], ['itm_005', 50]]],
  ['PO-0012', '2026-10-20', 'ven_003', [['itm_001', 100, 58000], ['itm_002', 50, 7500], ['itm_003', 10, 120000]], 'GRN-0087', '2026-10-25', [['itm_001', 100], ['itm_002', 50], ['itm_003', 8]]],
  ['PO-0015', '2026-10-21', 'ven_002', [['itm_007', 4, 1120000]], 'GRN-0091', '2026-10-27', [['itm_007', 4]]],
  ['PO-0019', '2026-10-24', 'ven_004', [['itm_006', 10, 380000], ['itm_008', 2, 100000]], 'GRN-0099', '2026-10-29', [['itm_006', 10]]],
];

export const DEMO_USERS = [
  { id: 'usr_001', name: 'Admin Sistem', email: 'admin@demo.id', role: Role.ADMIN },
  { id: 'usr_002', name: 'Rina Staf', email: 'staf@demo.id', role: Role.STAF_FINANCE },
  { id: 'usr_003', name: 'Budi Verifikator', email: 'verif@demo.id', role: Role.VERIFIKATOR },
];

/** Mengganti seluruh data master. Aman dijalankan ulang (tidak ada tabel transaksi yang mengacu ke sini lewat FK). */
export async function seedMaster(em: EntityManager): Promise<void> {
  await em.query('TRUNCATE TABLE grn_lines, goods_receipts, po_lines, purchase_orders, items, vendors RESTART IDENTITY CASCADE');
  await em.getRepository(Vendor).insert(VENDORS as Vendor[]);
  await em.getRepository(Item).insert(ITEMS as Item[]);

  for (const [poNo, poDate, vendorId, lines, grnNo, grnDate, received] of PURCHASES) {
    const poId = `po_${poNo.slice(3)}`;
    await em.getRepository(PurchaseOrder).insert({ id: poId, poNumber: poNo, poDate, vendorId });
    await em.getRepository(PoLine).insert(
      lines.map(([itemId, quantity, unitPrice], i) => ({ id: `${poId}_l${i + 1}`, poId, lineNo: i + 1, itemId, quantity, unitPrice })),
    );
    const grnId = `grn_${grnNo.slice(4)}`;
    await em.getRepository(GoodsReceipt).insert({ id: grnId, grnNumber: grnNo, poId, receivedDate: grnDate });
    await em.getRepository(GrnLine).insert(
      received.map(([itemId, quantityReceived], i) => ({ id: `${grnId}_l${i + 1}`, grnId, lineNo: i + 1, itemId, quantityReceived })),
    );
  }
}

export async function seedUsers(em: EntityManager, password: string): Promise<void> {
  const hash = await bcrypt.hash(password, 10);
  for (const u of DEMO_USERS) {
    const exists = await em.getRepository(User).findOne({ where: { email: u.email } });
    if (exists) continue;
    await em.getRepository(User).insert({ ...u, passwordHash: hash, isActive: true, lastLoginAt: null });
  }
}

export async function resetSettings(em: EntityManager): Promise<void> {
  await em.getRepository(Setting).save({ id: 'default', priceTolerancePct: 0.5, confidenceThreshold: 0.7, manualMinutesPerInvoice: 10, updatedBy: null });
}
