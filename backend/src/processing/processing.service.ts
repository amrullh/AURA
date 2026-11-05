import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { config } from '../config';
import { AuditAction, MAX_ITERATIONS, ProcessingStatus, Role, Verdict } from '../common/enums';
import { idNumber } from '../common/format';
import { Invoice } from '../database/entities';
import { AGENT_ACTOR, AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AgentClient, AgentError, AgentResult } from './agent.types';

/**
 * Antrean pemrosesan di dalam proses (tanpa Redis/BullMQ).
 * - Invoice masuk dengan QUEUED. Pekerja mengambil yang tertua, paling banyak `PROCESSING_CONCURRENCY` sekaligus.
 * - Saat server menyala, invoice yang tertinggal PROCESSING dikembalikan ke QUEUED.
 * - Hasil agent diperiksa bentuknya. Aturan ambang keyakinan dijaga di sini, bukan hanya di agent.
 */
@Injectable()
export class ProcessingService implements OnModuleInit {
  private readonly logger = new Logger(ProcessingService.name);
  private running = 0;

  constructor(
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
    private readonly agent: AgentClient,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const res = await this.repo.update(
      { processingStatus: ProcessingStatus.PROCESSING },
      { processingStatus: ProcessingStatus.QUEUED, startedAt: null, iteration: null },
    );
    if (res.affected) this.logger.warn(`${res.affected} invoice yang tertinggal PROCESSING dikembalikan ke QUEUED.`);
    this.kick();
  }

  /** Dipanggil setelah ada invoice baru atau retry. */
  kick() {
    setImmediate(() => void this.pump());
  }

  private async pump() {
    while (this.running < config.concurrency()) {
      this.running++; // dinaikkan sebelum await agar dua pump tidak melewati batas bersamaan
      let id: string | null = null;
      try {
        id = await this.claimNext();
      } catch (e) {
        this.logger.error(`Gagal mengambil antrean: ${(e as Error).message}`);
      }
      if (!id) {
        this.running--;
        return;
      }
      void this.run(id).finally(() => {
        this.running--;
        this.kick();
      });
    }
  }

  /** Mengambil invoice QUEUED tertua dan menandainya PROCESSING. */
  private async claimNext(): Promise<string | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const next = await this.repo.findOne({
        where: { processingStatus: ProcessingStatus.QUEUED },
        order: { createdAt: 'ASC', id: 'ASC' },
        select: { id: true },
      });
      if (!next) return null;
      const res = await this.repo.update(
        { id: next.id, processingStatus: ProcessingStatus.QUEUED },
        { processingStatus: ProcessingStatus.PROCESSING, startedAt: new Date(), iteration: 0 },
      );
      if (res.affected) return next.id;
    }
    return null;
  }

  private async run(id: string) {
    const inv = await this.repo.findOne({ where: { id } });
    if (!inv || inv.processingStatus !== ProcessingStatus.PROCESSING) return;

    try {
      if (!inv.filePath) throw new AgentError('Berkas tidak ditemukan.');
      let buf: Buffer;
      try {
        buf = await this.storage.read(inv.filePath);
      } catch {
        throw new AgentError('Berkas tidak ditemukan di penyimpanan.');
      }
      const result = await this.agent.process(
        {
          invoice_id: inv.id,
          file_name: inv.fileName,
          content_type: inv.contentType,
          file_base64: buf.toString('base64'),
          settings: {
            price_tolerance_pct: inv.priceTolerancePct,
            confidence_threshold: inv.confidenceThreshold,
            max_iterations: MAX_ITERATIONS,
          },
        },
        {
          onProgress: async (n) => {
            await this.repo.update({ id, processingStatus: ProcessingStatus.PROCESSING }, { iteration: n });
          },
        },
      );
      await this.complete(inv, result);
    } catch (e) {
      await this.fail(inv, e);
    }
  }

  private async complete(inv: Invoice, result: AgentResult) {
    const verdictValues = Object.values(Verdict) as string[];
    if (!verdictValues.includes(result?.verdict) || typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      throw new AgentError('Respons agent tidak valid.');
    }

    let verdict = result.verdict as Verdict;
    let reason = result.review_reason ?? null;
    // Pagar BE: temuan dengan keyakinan di bawah ambang selalu diserahkan ke manusia (Verifikator).
    if (verdict === Verdict.EXCEPTION && result.confidence < inv.confidenceThreshold) {
      verdict = Verdict.NEEDS_REVIEW;
      reason = null;
    }
    if (verdict === Verdict.NEEDS_REVIEW) reason = reason ?? `Keyakinan rendah (${idNumber(result.confidence)})`;
    else reason = null;

    const now = new Date();
    const patch: Partial<Invoice> = {
      processingStatus: ProcessingStatus.DONE,
      iteration: Math.min(Math.max(Math.trunc(result.iterations ?? 0), 0), MAX_ITERATIONS),
      verdict,
      confidence: result.confidence,
      queueOwner: verdict === Verdict.NEEDS_REVIEW ? Role.VERIFIKATOR : Role.STAF_FINANCE,
      reviewReason: reason,
      invoiceNumber: result.invoice?.invoice_number ?? null,
      vendorId: result.invoice?.vendor_id ?? null,
      vendorName: result.invoice?.vendor_name ?? null,
      poNumber: result.invoice?.po_number ?? null,
      invoiceDate: result.invoice?.invoice_date ?? null,
      totalAmount: result.invoice?.total_amount != null ? Math.round(result.invoice.total_amount) : null,
      differenceAmount: result.difference_amount != null ? Math.round(result.difference_amount) : null,
      analysis: {
        extraction: result.extraction ?? null,
        comparison: result.comparison ?? null,
        tax_check: result.tax_check ?? null,
        duplicate: result.duplicate ?? null,
        investigation: result.investigation ?? null,
        finding: result.finding ?? null,
      },
      finishedAt: now,
      durationMs: inv.startedAt ? now.getTime() - inv.startedAt.getTime() : null,
      errorMessage: null,
    };

    await this.repo.manager.transaction(async (em) => {
      // Hanya menimpa bila invoice masih PROCESSING (belum dihapus oleh reset demo atau diproses ulang).
      const res = await em.getRepository(Invoice).update({ id: inv.id, processingStatus: ProcessingStatus.PROCESSING }, patch);
      if (!res.affected) return;
      await this.audit.add(
        {
          actor: AGENT_ACTOR,
          action: AuditAction.INVOICE_PROCESSED,
          objectType: 'INVOICE',
          objectId: inv.id,
          summary: `Selesai diproses, verdict ${verdict}`,
          detail: { verdict, confidence: result.confidence, iterations: patch.iteration, duration_ms: patch.durationMs },
        },
        em,
      );
    });
  }

  private async fail(inv: Invoice, e: unknown) {
    const message = e instanceof AgentError ? e.message : 'Pemrosesan gagal. Coba ulang beberapa saat lagi.';
    if (!(e instanceof AgentError)) this.logger.error(`Invoice ${inv.id}: ${(e as Error)?.stack ?? e}`);
    const now = new Date();
    await this.repo.manager.transaction(async (em) => {
      const res = await em.getRepository(Invoice).update(
        { id: inv.id, processingStatus: ProcessingStatus.PROCESSING },
        {
          processingStatus: ProcessingStatus.FAILED,
          errorMessage: message,
          finishedAt: now,
          durationMs: inv.startedAt ? now.getTime() - inv.startedAt.getTime() : null,
          queueOwner: null,
        },
      );
      if (!res.affected) return;
      await this.audit.add(
        {
          actor: AGENT_ACTOR,
          action: AuditAction.INVOICE_PROCESSED,
          objectType: 'INVOICE',
          objectId: inv.id,
          summary: 'Gagal diproses',
          detail: { status: 'FAILED', error: message },
        },
        em,
      );
    });
  }
}
