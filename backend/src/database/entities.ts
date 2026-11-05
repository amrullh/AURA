import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ActorType, DecisionStatus, ProcessingStatus, Role, Verdict } from '../common/enums';

const TS = 'timestamptz' as const;

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar', unique: true }) email!: string;
  @Column({ type: 'varchar', name: 'password_hash' }) passwordHash!: string;
  @Column({ type: 'enum', enum: Role, enumName: 'role' }) role!: Role;
  @Column({ type: 'boolean', name: 'is_active', default: true }) isActive!: boolean;
  @Column({ type: TS, name: 'last_login_at', nullable: true }) lastLoginAt!: Date | null;
  @CreateDateColumn({ type: TS, name: 'created_at' }) createdAt!: Date;
}

// ---------- Data master (dibaca agent lewat user baca-saja) ----------

@Entity('vendors')
export class Vendor {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) npwp!: string;
  @Column({ type: 'int', name: 'payment_terms_days', default: 30 }) paymentTermsDays!: number;
  @Column({ type: 'boolean', name: 'has_contract', default: false }) hasContract!: boolean;
  /** Kutipan kontrak sintetis untuk tool tarik_kontrak_vendor. */
  @Column({ type: 'text', name: 'contract_text', nullable: true }) contractText!: string | null;
}

@Entity('items')
export class Item {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar', unique: true }) sku!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) unit!: string;
}

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar', name: 'po_number', unique: true }) poNumber!: string;
  @Column({ type: 'date', name: 'po_date' }) poDate!: string;
  @Column({ type: 'varchar', name: 'vendor_id' }) vendorId!: string;
  @ManyToOne(() => Vendor) @JoinColumn({ name: 'vendor_id' }) vendor?: Vendor;
  @OneToMany(() => PoLine, (l) => l.po) lines?: PoLine[];
  @OneToMany(() => GoodsReceipt, (g) => g.po) grns?: GoodsReceipt[];
}

@Entity('po_lines')
@Unique(['poId', 'lineNo'])
export class PoLine {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar', name: 'po_id' }) poId!: string;
  @Column({ type: 'int', name: 'line_no' }) lineNo!: number;
  @Column({ type: 'varchar', name: 'item_id' }) itemId!: string;
  @Column({ type: 'int' }) quantity!: number;
  /** Rupiah bulat. */
  @Column({ type: 'int', name: 'unit_price' }) unitPrice!: number;
  @ManyToOne(() => PurchaseOrder, (p) => p.lines, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'po_id' }) po?: PurchaseOrder;
  @ManyToOne(() => Item) @JoinColumn({ name: 'item_id' }) item?: Item;
}

@Entity('goods_receipts')
export class GoodsReceipt {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar', name: 'grn_number', unique: true }) grnNumber!: string;
  @Column({ type: 'varchar', name: 'po_id' }) poId!: string;
  @Column({ type: 'date', name: 'received_date' }) receivedDate!: string;
  @ManyToOne(() => PurchaseOrder, (p) => p.grns) @JoinColumn({ name: 'po_id' }) po?: PurchaseOrder;
  @OneToMany(() => GrnLine, (l) => l.grn) lines?: GrnLine[];
}

@Entity('grn_lines')
@Unique(['grnId', 'lineNo'])
export class GrnLine {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar', name: 'grn_id' }) grnId!: string;
  @Column({ type: 'int', name: 'line_no' }) lineNo!: number;
  @Column({ type: 'varchar', name: 'item_id' }) itemId!: string;
  @Column({ type: 'int', name: 'quantity_received' }) quantityReceived!: number;
  @ManyToOne(() => GoodsReceipt, (g) => g.lines, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'grn_id' }) grn?: GoodsReceipt;
  @ManyToOne(() => Item) @JoinColumn({ name: 'item_id' }) item?: Item;
}

// ---------- Data transaksi ----------

@Entity('batches')
export class Batch {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar', name: 'created_by_id', nullable: true }) createdById!: string | null;
  @Column({ type: 'varchar', name: 'created_by_name' }) createdByName!: string;
  @CreateDateColumn({ type: TS, name: 'created_at' }) createdAt!: Date;
  @OneToMany(() => Invoice, (i) => i.batch) invoices?: Invoice[];
}

@Entity('invoices')
@Index(['batchId'])
@Index(['processingStatus'])
@Index(['verdict', 'decisionStatus'])
@Index(['invoiceNumber'])
export class Invoice {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar', name: 'batch_id' }) batchId!: string;

  // berkas
  @Column({ type: 'varchar', name: 'file_name' }) fileName!: string;
  @Column({ type: 'varchar', name: 'file_path', nullable: true }) filePath!: string | null;
  @Column({ type: 'varchar', name: 'file_hash', unique: true }) fileHash!: string;
  @Column({ type: 'varchar', name: 'content_type' }) contentType!: string;
  @Column({ type: 'int', name: 'page_count', default: 1 }) pageCount!: number;

  // hasil ekstraksi (null sampai terbaca)
  @Column({ type: 'varchar', name: 'invoice_number', nullable: true }) invoiceNumber!: string | null;
  @Column({ type: 'varchar', name: 'vendor_id', nullable: true }) vendorId!: string | null;
  @Column({ type: 'varchar', name: 'vendor_name', nullable: true }) vendorName!: string | null;
  @Column({ type: 'varchar', name: 'po_number', nullable: true }) poNumber!: string | null;
  @Column({ type: 'date', name: 'invoice_date', nullable: true }) invoiceDate!: string | null;
  @Column({ type: 'bigint', name: 'total_amount', nullable: true, transformer: bigintToNumber() }) totalAmount!: number | null;
  @Column({ type: 'bigint', name: 'difference_amount', nullable: true, transformer: bigintToNumber() }) differenceAmount!: number | null;

  // tiga status terpisah
  @Column({ type: 'enum', enum: ProcessingStatus, enumName: 'processing_status', name: 'processing_status', default: ProcessingStatus.QUEUED })
  processingStatus!: ProcessingStatus;
  @Column({ type: 'int', nullable: true }) iteration!: number | null;
  @Column({ type: 'enum', enum: Verdict, enumName: 'verdict', nullable: true }) verdict!: Verdict | null;
  @Column({ type: 'float', nullable: true }) confidence!: number | null;
  @Column({ type: 'enum', enum: DecisionStatus, enumName: 'decision_status', name: 'decision_status', default: DecisionStatus.PENDING })
  decisionStatus!: DecisionStatus;
  /** Siapa yang berhak memutuskan sekarang: STAF_FINANCE atau VERIFIKATOR. */
  @Column({ type: 'enum', enum: Role, enumName: 'role', name: 'queue_owner', nullable: true }) queueOwner!: Role | null;
  @Column({ type: 'varchar', name: 'review_reason', nullable: true }) reviewReason!: string | null;

  // aturan yang berlaku saat batch dibuat (perubahan Admin hanya berlaku untuk batch berikutnya)
  @Column({ type: 'float', name: 'price_tolerance_pct', default: 0.5 }) priceTolerancePct!: number;
  @Column({ type: 'float', name: 'confidence_threshold', default: 0.7 }) confidenceThreshold!: number;

  /** Hasil agent: extraction, comparison, tax_check, duplicate, investigation, finding. */
  @Column({ type: 'jsonb', nullable: true }) analysis!: Record<string, any> | null;

  @Column({ type: TS, name: 'started_at', nullable: true }) startedAt!: Date | null;
  @Column({ type: TS, name: 'finished_at', nullable: true }) finishedAt!: Date | null;
  @Column({ type: 'int', name: 'duration_ms', nullable: true }) durationMs!: number | null;
  @Column({ type: 'text', name: 'error_message', nullable: true }) errorMessage!: string | null;
  @CreateDateColumn({ type: TS, name: 'created_at' }) createdAt!: Date;

  @ManyToOne(() => Batch, (b) => b.invoices, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'batch_id' }) batch?: Batch;
  @OneToMany(() => Decision, (d) => d.invoice) decisions?: Decision[];
}

/** Keputusan manusia. Entri agent disusun dari kolom invoice, tidak disimpan di sini. */
@Entity('decisions')
@Index(['invoiceId'])
export class Decision {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @Column({ type: 'varchar', name: 'invoice_id' }) invoiceId!: string;
  @Column({ type: 'varchar', name: 'actor_id' }) actorId!: string;
  @Column({ type: 'varchar', name: 'actor_name' }) actorName!: string;
  @Column({ type: 'enum', enum: Role, enumName: 'role', name: 'actor_role' }) actorRole!: Role;
  @Column({ type: 'varchar' }) action!: string; // APPROVE | REJECT | ESCALATE
  @Column({ type: 'text' }) reason!: string;
  @CreateDateColumn({ type: TS, name: 'created_at' }) createdAt!: Date;
  @ManyToOne(() => Invoice, (i) => i.decisions, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'invoice_id' }) invoice?: Invoice;
}

/** Hanya bertambah. Tidak ada kode yang mengubah atau menghapus baris di sini. */
@Entity('audit_logs')
@Index(['createdAt'])
@Index(['action'])
export class AuditLog {
  @PrimaryColumn({ type: 'varchar' }) id!: string;
  @CreateDateColumn({ type: TS, name: 'created_at' }) createdAt!: Date;
  @Column({ type: 'enum', enum: ActorType, enumName: 'actor_type', name: 'actor_type' }) actorType!: ActorType;
  @Column({ type: 'varchar', name: 'actor_id' }) actorId!: string;
  @Column({ type: 'varchar', name: 'actor_name' }) actorName!: string;
  @Column({ type: 'varchar' }) action!: string;
  @Column({ type: 'varchar', name: 'object_type' }) objectType!: string;
  @Column({ type: 'varchar', name: 'object_id' }) objectId!: string;
  @Column({ type: 'text' }) summary!: string;
  @Column({ type: 'jsonb', nullable: true }) detail!: Record<string, any> | null;
}

@Entity('settings')
export class Setting {
  @PrimaryColumn({ type: 'varchar', default: 'default' }) id!: string;
  @Column({ type: 'float', name: 'price_tolerance_pct', default: 0.5 }) priceTolerancePct!: number;
  @Column({ type: 'float', name: 'confidence_threshold', default: 0.7 }) confidenceThreshold!: number;
  @Column({ type: 'float', name: 'manual_minutes_per_invoice', nullable: true }) manualMinutesPerInvoice!: number | null;
  @UpdateDateColumn({ type: TS, name: 'updated_at' }) updatedAt!: Date;
  @Column({ type: 'varchar', name: 'updated_by', nullable: true }) updatedBy!: string | null;
}

/** Postgres mengembalikan bigint sebagai string. Rupiah muat dalam Number (di bawah 2^53). */
function bigintToNumber() {
  return {
    to: (v: number | null | undefined) => v,
    from: (v: string | null) => (v === null || v === undefined ? null : Number(v)),
  };
}

export const ALL_ENTITIES = [
  User, Vendor, Item, PurchaseOrder, PoLine, GoodsReceipt, GrnLine,
  Batch, Invoice, Decision, AuditLog, Setting,
];
