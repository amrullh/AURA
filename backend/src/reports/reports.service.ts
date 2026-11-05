import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Err } from '../common/errors';
import { DecisionAction, ProcessingStatus, Verdict } from '../common/enums';
import { Decision, Invoice } from '../database/entities';
import { SettingsService } from '../settings/settings.service';
import { MetricsQueryDto } from './reports.dto';

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Definisi metrik (semua dihitung dari data nyata di database, dalam cakupan filter):
 * - invoices_total          : semua invoice (termasuk yang belum selesai atau gagal).
 * - avg_processing_seconds  : rata-rata durasi invoice DONE.
 * - auto_clear_percent      : % invoice DONE berverdict CLEAN (agent tidak menemukan masalah). Tetap menunggu persetujuan manusia.
 * - difference_caught_total : jumlah selisih Rupiah pada invoice berverdict EXCEPTION atau NEEDS_REVIEW.
 * - escalation_rate_percent : % invoice DONE yang pernah dieskalasi Staf.
 * - by_vendor               : 10 vendor dengan total selisih EXCEPTION terbesar.
 * - estimated_hours_saved   : (invoice DONE x manual_minutes_per_invoice) / 60. Perkiraan; null bila menit belum diisi Admin.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Decision) private readonly decisions: Repository<Decision>,
    private readonly settings: SettingsService,
  ) {}

  async metrics(q: MetricsQueryDto) {
    if (q.from && q.to && q.from > q.to) throw Err.validation('Tanggal from tidak boleh setelah to.');

    const scope = () => {
      const qb = this.invoices.createQueryBuilder('i');
      if (q.batch_id) qb.andWhere('i.batchId = :batchId', { batchId: q.batch_id });
      if (q.from) qb.andWhere('i.createdAt >= :from', { from: new Date(`${q.from}T00:00:00+07:00`) });
      if (q.to) qb.andWhere('i.createdAt <= :to', { to: new Date(`${q.to}T23:59:59.999+07:00`) });
      return qb;
    };
    const done = ProcessingStatus.DONE;

    const [total, doneAgg, verdictRows, diffAgg, vendorRows, escalated, rules] = await Promise.all([
      scope().getCount(),
      scope()
        .select('COUNT(*)', 'n')
        .addSelect('AVG(i.durationMs)', 'avg_ms')
        .andWhere('i.processingStatus = :done', { done })
        .getRawOne<{ n: string; avg_ms: string | null }>(),
      scope()
        .select('i.verdict', 'verdict')
        .addSelect('COUNT(*)', 'n')
        .andWhere('i.processingStatus = :done', { done })
        .groupBy('i.verdict')
        .getRawMany<{ verdict: Verdict; n: string }>(),
      scope()
        .select('COALESCE(SUM(i.differenceAmount), 0)', 'sum')
        .andWhere('i.processingStatus = :done', { done })
        .andWhere('i.verdict IN (:...v)', { v: [Verdict.EXCEPTION, Verdict.NEEDS_REVIEW] })
        .getRawOne<{ sum: string }>(),
      scope()
        .select('i.vendorName', 'vendor_name')
        .addSelect('COUNT(*)', 'exception_count')
        .addSelect('COALESCE(SUM(i.differenceAmount), 0)', 'difference_total')
        .andWhere('i.processingStatus = :done', { done })
        .andWhere('i.verdict = :ex', { ex: Verdict.EXCEPTION })
        .andWhere('i.vendorName IS NOT NULL')
        .groupBy('i.vendorName')
        .orderBy('difference_total', 'DESC')
        .addOrderBy('exception_count', 'DESC')
        .limit(10)
        .getRawMany<{ vendor_name: string; exception_count: string; difference_total: string }>(),
      this.countEscalated(scope),
      this.settings.getRow(),
    ]);

    const doneCount = Number(doneAgg?.n ?? 0);
    const byVerdict = { clean: 0, exception: 0, duplicate: 0, needs_review: 0 };
    for (const r of verdictRows) {
      const key = (r.verdict ?? '').toLowerCase() as keyof typeof byVerdict;
      if (key in byVerdict) byVerdict[key] = Number(r.n);
    }
    const pct = (n: number) => (doneCount === 0 ? 0 : round((n / doneCount) * 100, 1));

    return {
      invoices_total: total,
      avg_processing_seconds: doneAgg?.avg_ms ? round(Number(doneAgg.avg_ms) / 1000, 1) : 0,
      auto_clear_percent: pct(byVerdict.clean),
      difference_caught_total: Number(diffAgg?.sum ?? 0),
      escalation_rate_percent: pct(escalated),
      by_verdict: byVerdict,
      by_vendor: vendorRows.map((r) => ({
        vendor_name: r.vendor_name,
        exception_count: Number(r.exception_count),
        difference_total: Number(r.difference_total),
      })),
      estimated_hours_saved:
        rules.manualMinutesPerInvoice == null ? null : round((doneCount * rules.manualMinutesPerInvoice) / 60, 1),
    };
  }

  /** Jumlah invoice DONE dalam cakupan yang pernah punya keputusan ESCALATE. */
  private async countEscalated(scope: () => ReturnType<Repository<Invoice>['createQueryBuilder']>): Promise<number> {
    const ids = await scope().select('i.id', 'id').andWhere('i.processingStatus = :d', { d: ProcessingStatus.DONE }).getRawMany<{ id: string }>();
    if (!ids.length) return 0;
    const row = await this.decisions
      .createQueryBuilder('d')
      .select('COUNT(DISTINCT d.invoiceId)', 'n')
      .where('d.action = :a', { a: DecisionAction.ESCALATE })
      .andWhere('d.invoiceId IN (:...ids)', { ids: ids.map((x) => x.id) })
      .getRawOne<{ n: string }>();
    return Number(row?.n ?? 0);
  }
}
