import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Err } from '../common/errors';
import { pageOf, skipOf } from '../common/pagination';
import { GoodsReceipt, GrnLine, Item, PoLine, PurchaseOrder, Vendor } from '../database/entities';
import { MasterQueryDto } from './master.dto';

export const MASTER_TYPES = ['vendors', 'items', 'purchase-orders', 'goods-receipts'] as const;
export type MasterType = (typeof MASTER_TYPES)[number];

const COLUMNS: Record<MasterType, { key: string; label: string }[]> = {
  vendors: [
    { key: 'id', label: 'ID' }, { key: 'name', label: 'Nama vendor' }, { key: 'npwp', label: 'NPWP' },
    { key: 'payment_terms_days', label: 'Tempo bayar (hari)' }, { key: 'has_contract', label: 'Ada kontrak' },
  ],
  items: [
    { key: 'id', label: 'ID' }, { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Nama barang' }, { key: 'unit', label: 'Satuan' },
  ],
  'purchase-orders': [
    { key: 'po_number', label: 'No. PO' }, { key: 'po_date', label: 'Tanggal' }, { key: 'vendor_name', label: 'Vendor' },
    { key: 'line_no', label: 'Baris' }, { key: 'item_name', label: 'Barang' }, { key: 'quantity', label: 'Jumlah' },
    { key: 'unit_price', label: 'Harga satuan' },
  ],
  'goods-receipts': [
    { key: 'grn_number', label: 'No. GRN' }, { key: 'po_number', label: 'No. PO' }, { key: 'received_date', label: 'Tanggal terima' },
    { key: 'line_no', label: 'Baris' }, { key: 'item_name', label: 'Barang' }, { key: 'quantity_received', label: 'Jumlah diterima' },
  ],
};

@Injectable()
export class MasterService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(type: string, q: MasterQueryDto) {
    if (!(MASTER_TYPES as readonly string[]).includes(type)) {
      throw Err.validation(`Jenis data master tidak dikenal. Pilihan: ${MASTER_TYPES.join(', ')}.`);
    }
    const t = type as MasterType;
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 20;
    const search = q.q?.trim() ? `%${q.q.trim().replace(/[%_\\]/g, '\\$&')}%` : null;

    const qb = this.build(t, search);
    const total = await qb.getCount();
    const raw = await qb.offset(skipOf(page, pageSize)).limit(pageSize).getRawMany();
    const data = raw.map((r) => this.shape(t, r));
    return { columns: COLUMNS[t], ...pageOf(data, page, pageSize, total) };
  }

  private build(t: MasterType, search: string | null): SelectQueryBuilder<ObjectLiteral> {
    const repo = (e: any) => this.ds.getRepository(e);
    switch (t) {
      case 'vendors': {
        const qb = repo(Vendor).createQueryBuilder('v')
          .select(['v.id AS id', 'v.name AS name', 'v.npwp AS npwp', 'v.payment_terms_days AS payment_terms_days', 'v.has_contract AS has_contract'])
          .orderBy('v.id', 'ASC');
        if (search) qb.where('(v.name ILIKE :s OR v.npwp ILIKE :s OR v.id ILIKE :s)', { s: search });
        return qb;
      }
      case 'items': {
        const qb = repo(Item).createQueryBuilder('it')
          .select(['it.id AS id', 'it.sku AS sku', 'it.name AS name', 'it.unit AS unit'])
          .orderBy('it.id', 'ASC');
        if (search) qb.where('(it.name ILIKE :s OR it.sku ILIKE :s)', { s: search });
        return qb;
      }
      case 'purchase-orders': {
        const qb = repo(PoLine).createQueryBuilder('l')
          .innerJoin(PurchaseOrder, 'p', 'p.id = l.po_id')
          .innerJoin(Vendor, 'v', 'v.id = p.vendor_id')
          .innerJoin(Item, 'it', 'it.id = l.item_id')
          .select([
            'p.po_number AS po_number', "to_char(p.po_date, 'YYYY-MM-DD') AS po_date", 'v.name AS vendor_name',
            'l.line_no AS line_no', 'it.name AS item_name', 'l.quantity AS quantity', 'l.unit_price AS unit_price',
          ])
          .orderBy('p.po_number', 'ASC').addOrderBy('l.line_no', 'ASC');
        if (search) qb.where('(p.po_number ILIKE :s OR v.name ILIKE :s OR it.name ILIKE :s)', { s: search });
        return qb;
      }
      case 'goods-receipts': {
        const qb = repo(GrnLine).createQueryBuilder('l')
          .innerJoin(GoodsReceipt, 'g', 'g.id = l.grn_id')
          .innerJoin(PurchaseOrder, 'p', 'p.id = g.po_id')
          .innerJoin(Item, 'it', 'it.id = l.item_id')
          .select([
            'g.grn_number AS grn_number', 'p.po_number AS po_number', "to_char(g.received_date, 'YYYY-MM-DD') AS received_date",
            'l.line_no AS line_no', 'it.name AS item_name', 'l.quantity_received AS quantity_received',
          ])
          .orderBy('g.grn_number', 'ASC').addOrderBy('l.line_no', 'ASC');
        if (search) qb.where('(g.grn_number ILIKE :s OR p.po_number ILIKE :s OR it.name ILIKE :s)', { s: search });
        return qb;
      }
    }
  }

  /** Mengambil hanya kolom yang dijanjikan kontrak, dengan tipe yang benar (angka sebagai angka). */
  private shape(t: MasterType, r: Record<string, any>) {
    const out: Record<string, unknown> = {};
    for (const c of COLUMNS[t]) {
      const v = r[c.key];
      out[c.key] = typeof v === 'string' && /^\d+$/.test(v) && ['payment_terms_days', 'line_no', 'quantity', 'unit_price', 'quantity_received'].includes(c.key) ? Number(v) : v;
    }
    return out;
  }
}
