import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOperator, FindOptionsOrder, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { AuthUser } from '../common/decorators';
import { AuditAction, DecisionAction, ProcessingStatus, Role } from '../common/enums';
import { AppError, Err } from '../common/errors';
import { newId } from '../common/id';
import { pageOf, skipOf } from '../common/pagination';
import { Decision, Invoice } from '../database/entities';
import { AuditService, userActor } from '../audit/audit.service';
import { ProcessingService } from '../processing/processing.service';
import { StorageService } from '../storage/storage.service';
import { evaluateDecision, myQueueWhere } from './decision.rules';
import { DecisionDto, InvoiceQueryDto, SORT_FIELDS } from './invoices.dto';
import { toDetail, toListItem } from './invoice.mapper';

const ACTION_AUDIT: Record<DecisionAction, { audit: AuditAction; verb: string }> = {
  [DecisionAction.APPROVE]: { audit: AuditAction.DECISION_APPROVE, verb: 'Menyetujui' },
  [DecisionAction.REJECT]: { audit: AuditAction.DECISION_REJECT, verb: 'Menolak' },
  [DecisionAction.ESCALATE]: { audit: AuditAction.DECISION_ESCALATE, verb: 'Mengeskalasi' },
};

/** Menggabungkan filter pengguna ke satu cabang "antrean saya". Mengembalikan null bila saling bertentangan. */
function mergeWhere(mine: FindOptionsWhere<Invoice>, filters: FindOptionsWhere<Invoice>): FindOptionsWhere<Invoice> | null {
  const out: Record<string, unknown> = { ...mine };
  for (const [key, val] of Object.entries(filters)) {
    if (!(key in out)) {
      out[key] = val;
      continue;
    }
    const existing = out[key];
    if (existing instanceof FindOperator) {
      const allowed = (existing as FindOperator<unknown>).value as unknown[];
      if (!Array.isArray(allowed) || !allowed.includes(val)) return null;
      out[key] = val;
    } else if (existing !== val) {
      return null;
    }
  }
  return out as FindOptionsWhere<Invoice>;
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
    @InjectRepository(Decision) private readonly decisions: Repository<Decision>,
    private readonly audit: AuditService,
    private readonly processing: ProcessingService,
    private readonly storage: StorageService,
  ) {}

  async list(q: InvoiceQueryDto, user: AuthUser) {
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 20;

    const filters: FindOptionsWhere<Invoice> = {};
    if (q.batch_id) filters.batchId = q.batch_id;
    if (q.processing_status) filters.processingStatus = q.processing_status;
    if (q.verdict) filters.verdict = q.verdict;
    if (q.decision_status) filters.decisionStatus = q.decision_status;
    if (q.vendor_id) filters.vendorId = q.vendor_id;
    if (q.q?.trim()) filters.invoiceNumber = ILike(`%${q.q.trim().replace(/[%_\\]/g, '\\$&')}%`);

    let where: FindOptionsWhere<Invoice>[] = [filters];
    if (q.queue === 'mine') {
      const mine = myQueueWhere(user.role);
      where = mine ? (mine.map((m) => mergeWhere(m, filters)).filter(Boolean) as FindOptionsWhere<Invoice>[]) : [];
      if (where.length === 0) return pageOf([], page, pageSize, 0);
    }

    const [rows, total] = await this.repo.findAndCount({
      where,
      order: this.parseSort(q.sort),
      skip: skipOf(page, pageSize),
      take: pageSize,
    });
    return pageOf(rows.map((r) => toListItem(r, user.role)), page, pageSize, total);
  }

  async get(id: string, user: AuthUser) {
    const inv = await this.repo.findOne({ where: { id } });
    if (!inv) throw Err.notFound('Invoice tidak ditemukan.');
    return this.detail(inv, user.role);
  }

  async decide(id: string, dto: DecisionDto, user: AuthUser) {
    await this.repo.manager.transaction(async (em) => {
      const inv = await em.getRepository(Invoice).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!inv) throw Err.notFound('Invoice tidak ditemukan.');

      const outcome = evaluateDecision(user.role, dto.action, inv);
      if (!outcome.ok) throw new AppError(outcome.status, outcome.code, outcome.message);

      const from = inv.decisionStatus;
      await em.getRepository(Invoice).update(
        { id },
        { decisionStatus: outcome.next.decisionStatus, queueOwner: outcome.next.queueOwner, reviewReason: outcome.next.reviewReason },
      );
      await em.getRepository(Decision).insert({
        id: newId('dec'),
        invoiceId: id,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: dto.action,
        reason: dto.reason.trim(),
      });
      const meta = ACTION_AUDIT[dto.action];
      await this.audit.add(
        {
          actor: userActor(user),
          action: meta.audit,
          objectType: 'INVOICE',
          objectId: id,
          summary: `${meta.verb} ${inv.invoiceNumber ?? id}`,
          detail: { reason: dto.reason.trim(), from_status: from, to_status: outcome.next.decisionStatus },
        },
        em,
      );
    });
    return this.get(id, user);
  }

  async retry(id: string, user: AuthUser) {
    await this.repo.manager.transaction(async (em) => {
      const inv = await em.getRepository(Invoice).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!inv) throw Err.notFound('Invoice tidak ditemukan.');
      if (inv.processingStatus !== ProcessingStatus.FAILED) {
        throw Err.invalidTransition('Hanya invoice yang gagal diproses yang dapat dicoba ulang.');
      }
      await em.getRepository(Invoice).update(
        { id },
        { processingStatus: ProcessingStatus.QUEUED, errorMessage: null, startedAt: null, finishedAt: null, durationMs: null, iteration: null },
      );
      await this.audit.add(
        { actor: userActor(user), action: AuditAction.INVOICE_RETRY, objectType: 'INVOICE', objectId: id, summary: `Mencoba ulang ${inv.fileName}` },
        em,
      );
    });
    this.processing.kick();
    const fresh = await this.repo.findOneOrFail({ where: { id } });
    return toListItem(fresh, user.role);
  }

  async file(id: string): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const inv = await this.repo.findOne({ where: { id } });
    if (!inv || !inv.filePath) throw Err.notFound('Berkas tidak ditemukan.');
    try {
      return { buffer: await this.storage.read(inv.filePath), contentType: inv.contentType, fileName: inv.fileName };
    } catch {
      throw Err.notFound('Berkas tidak ditemukan.');
    }
  }

  private async detail(inv: Invoice, role: Role) {
    const decisions = await this.decisions.find({ where: { invoiceId: inv.id }, order: { createdAt: 'ASC' } });
    return toDetail(inv, role, decisions);
  }

  private parseSort(sort?: string): FindOptionsOrder<Invoice> {
    const raw = sort?.trim() || '-created_at';
    const desc = raw.startsWith('-');
    const field = SORT_FIELDS[desc ? raw.slice(1) : raw];
    if (!field) throw Err.validation(`sort tidak valid. Pilihan: ${Object.keys(SORT_FIELDS).join(', ')}.`);
    return {
      [field]: { direction: desc ? 'DESC' : 'ASC', nulls: 'LAST' },
      id: 'ASC',
    } as FindOptionsOrder<Invoice>;
  }
}
