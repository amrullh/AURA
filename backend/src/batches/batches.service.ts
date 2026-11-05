import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { config } from '../config';
import { AuthUser } from '../common/decorators';
import { AuditAction, DecisionStatus, ProcessingStatus, Verdict } from '../common/enums';
import { Err } from '../common/errors';
import { defaultBatchName } from '../common/format';
import { newId } from '../common/id';
import { pageOf, skipOf } from '../common/pagination';
import { Batch, Invoice } from '../database/entities';
import { AuditService, userActor } from '../audit/audit.service';
import { ProcessingService } from '../processing/processing.service';
import { SettingsService } from '../settings/settings.service';
import { countPdfPages, detectType, sha256, StorageService } from '../storage/storage.service';
import { PageQueryDto } from '../users/users.dto';

export interface IncomingFile {
  name: string;
  buffer: Buffer;
}

type RejectReason = 'DUPLICATE_FILE' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE';
const REJECT_TEXT: Record<RejectReason, string> = {
  DUPLICATE_FILE: 'Berkas ganda, sudah pernah diunggah.',
  UNSUPPORTED_TYPE: 'Tipe tidak didukung (hanya PDF, JPG, PNG).',
  TOO_LARGE: 'Ukuran berkas melebihi batas.',
};

@Injectable()
export class BatchesService {
  constructor(
    @InjectRepository(Batch) private readonly batches: Repository<Batch>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly processing: ProcessingService,
  ) {}

  async list(q: PageQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 20;
    const [rows, total] = await this.batches.findAndCount({ order: { createdAt: 'DESC', id: 'DESC' }, skip: skipOf(page, pageSize), take: pageSize });
    return pageOf(await this.toDtos(rows), page, pageSize, total);
  }

  async get(id: string) {
    const b = await this.batches.findOne({ where: { id } });
    if (!b) throw Err.notFound('Batch tidak ditemukan.');
    return (await this.toDtos([b]))[0];
  }

  async recent(limit: number) {
    const rows = await this.batches.find({ order: { createdAt: 'DESC', id: 'DESC' }, take: limit });
    return this.toDtos(rows);
  }

  /** Validasi berkas, simpan, buat batch dan invoice (QUEUED), lalu bangunkan antrean. */
  async create(files: IncomingFile[], name: string | undefined, user: AuthUser) {
    if (!files.length) throw Err.validation('Pilih minimal satu berkas invoice.');
    if (files.length > config.maxFilesPerBatch()) throw Err.validation(`Maksimal ${config.maxFilesPerBatch()} berkas per batch.`);

    const maxBytes = config.maxFileSizeMb() * 1024 * 1024;
    const rejected: { file_name: string; reason: RejectReason }[] = [];
    const candidates: { name: string; buffer: Buffer; hash: string; type: NonNullable<ReturnType<typeof detectType>> }[] = [];
    const seen = new Set<string>();

    for (const f of files) {
      const type = detectType(f.buffer);
      if (!type) { rejected.push({ file_name: f.name, reason: 'UNSUPPORTED_TYPE' }); continue; }
      if (f.buffer.length > maxBytes) { rejected.push({ file_name: f.name, reason: 'TOO_LARGE' }); continue; }
      const hash = sha256(f.buffer);
      if (seen.has(hash)) { rejected.push({ file_name: f.name, reason: 'DUPLICATE_FILE' }); continue; }
      seen.add(hash);
      candidates.push({ name: f.name, buffer: f.buffer, hash, type });
    }

    const existing = candidates.length
      ? await this.invoices.find({ where: { fileHash: In(candidates.map((c) => c.hash)) }, select: { fileHash: true } })
      : [];
    const existingHashes = new Set(existing.map((e) => e.fileHash));
    const accepted = candidates.filter((c) => {
      if (existingHashes.has(c.hash)) { rejected.push({ file_name: c.name, reason: 'DUPLICATE_FILE' }); return false; }
      return true;
    });

    if (!accepted.length) {
      throw Err.validation(
        'Tidak ada berkas yang dapat diproses.',
        rejected.map((r) => ({ field: r.file_name, message: REJECT_TEXT[r.reason] })),
      );
    }

    const rules = await this.settings.getRow(); // nilai ini "dibekukan" ke setiap invoice di batch ini
    const batchId = newId('bat');
    const batchName = name?.trim() || defaultBatchName();
    const saved: string[] = [];
    const base = Date.now();
    const invoiceRows: Partial<Invoice>[] = [];

    try {
      for (let i = 0; i < accepted.length; i++) {
        const a = accepted[i];
        const rel = await this.storage.save(a.buffer, a.hash, a.type.ext);
        saved.push(rel);
        invoiceRows.push({
          id: newId('inv'),
          batchId,
          fileName: a.name,
          filePath: rel,
          fileHash: a.hash,
          contentType: a.type.contentType,
          pageCount: a.type.ext === 'pdf' ? countPdfPages(a.buffer) : 1,
          priceTolerancePct: rules.priceTolerancePct,
          confidenceThreshold: rules.confidenceThreshold,
          createdAt: new Date(base + i), // menjaga urutan antrean sama dengan urutan unggah
        });
      }

      await this.batches.manager.transaction(async (em) => {
        await em.getRepository(Batch).insert({ id: batchId, name: batchName, createdById: user.id, createdByName: user.name });
        await em.getRepository(Invoice).insert(invoiceRows as Invoice[]);
        await this.audit.add(
          {
            actor: userActor(user),
            action: AuditAction.INVOICE_UPLOADED,
            objectType: 'BATCH',
            objectId: batchId,
            summary: `Mengunggah ${batchName} (${accepted.length} berkas)`,
            detail: { accepted: accepted.length, rejected: rejected.length },
          },
          em,
        );
      });
    } catch (e) {
      await Promise.all(saved.map((s) => this.storage.remove(s)));
      throw e;
    }

    this.processing.kick();
    return {
      batch: await this.get(batchId),
      accepted: invoiceRows.map((r) => ({ file_name: r.fileName as string, invoice_id: r.id as string })),
      rejected,
    };
  }

  async toDtos(batches: Batch[]) {
    if (!batches.length) return [];
    const rows = await this.invoices
      .createQueryBuilder('i')
      .select('i.batchId', 'batch_id')
      .addSelect('i.processingStatus', 'ps')
      .addSelect('i.verdict', 'v')
      .addSelect('i.decisionStatus', 'ds')
      .addSelect('COUNT(*)', 'n')
      .where('i.batchId IN (:...ids)', { ids: batches.map((b) => b.id) })
      .groupBy('i.batchId')
      .addGroupBy('i.processingStatus')
      .addGroupBy('i.verdict')
      .addGroupBy('i.decisionStatus')
      .getRawMany<{ batch_id: string; ps: ProcessingStatus; v: Verdict | null; ds: DecisionStatus; n: string }>();

    const by = new Map<string, { total: number; completed: number; clean: number; exception: number; duplicate: number; needs_review: number; failed: number; pending_decision: number }>();
    for (const b of batches) by.set(b.id, { total: 0, completed: 0, clean: 0, exception: 0, duplicate: 0, needs_review: 0, failed: 0, pending_decision: 0 });
    for (const r of rows) {
      const c = by.get(r.batch_id)!;
      const n = Number(r.n);
      c.total += n;
      if (r.ps === ProcessingStatus.DONE || r.ps === ProcessingStatus.FAILED) c.completed += n;
      if (r.ps === ProcessingStatus.FAILED) c.failed += n;
      if (r.ps === ProcessingStatus.DONE) {
        if (r.v === Verdict.CLEAN) c.clean += n;
        else if (r.v === Verdict.EXCEPTION) c.exception += n;
        else if (r.v === Verdict.DUPLICATE) c.duplicate += n;
        else if (r.v === Verdict.NEEDS_REVIEW) c.needs_review += n;
        if (r.ds === DecisionStatus.PENDING || r.ds === DecisionStatus.ESCALATED) c.pending_decision += n;
      }
    }
    return batches.map((b) => {
      const c = by.get(b.id)!;
      return {
        id: b.id,
        name: b.name,
        created_at: b.createdAt.toISOString(),
        created_by: b.createdByName,
        total: c.total,
        completed: c.completed,
        status: c.completed < c.total ? 'PROCESSING' : 'DONE',
        counts: {
          clean: c.clean, exception: c.exception, duplicate: c.duplicate,
          needs_review: c.needs_review, failed: c.failed, pending_decision: c.pending_decision,
        },
      };
    });
  }
}
