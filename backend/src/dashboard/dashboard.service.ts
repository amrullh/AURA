import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AuthUser } from '../common/decorators';
import { DecisionAction, DecisionStatus, ProcessingStatus, Role, Verdict } from '../common/enums';
import { startOfTodayWib } from '../common/format';
import { BatchesService } from '../batches/batches.service';
import { Decision, Invoice, User } from '../database/entities';
import { myQueueWhere } from '../invoices/decision.rules';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(Decision) private readonly decisions: Repository<Decision>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly batches: BatchesService,
  ) {}

  async summary(user: AuthUser) {
    const recent = await this.batches.recent(5);
    const mine = myQueueWhere(user.role);
    const out: Record<string, unknown> = {
      latest_batch: recent[0] ?? null,
      my_queue_count: mine ? await this.invoices.count({ where: mine }) : 0,
      recent_batches: recent,
    };

    if (user.role === Role.VERIFIKATOR) {
      const done = ProcessingStatus.DONE;
      const since = startOfTodayWib();
      const [needsReview, escalated, approved, rejected] = await Promise.all([
        this.invoices.count({ where: { processingStatus: done, decisionStatus: DecisionStatus.PENDING, verdict: Verdict.NEEDS_REVIEW } }),
        this.invoices.count({ where: { processingStatus: done, decisionStatus: DecisionStatus.ESCALATED } }),
        this.decisions.count({ where: { actorId: user.id, action: DecisionAction.APPROVE, createdAt: MoreThanOrEqual(since) } }),
        this.decisions.count({ where: { actorId: user.id, action: DecisionAction.REJECT, createdAt: MoreThanOrEqual(since) } }),
      ]);
      out.needs_review_count = needsReview;
      out.escalated_count = escalated;
      out.decided_today = { approved, rejected };
    }

    if (user.role === Role.ADMIN) {
      const active = await this.users.find({ where: { isActive: true }, select: { role: true } });
      const byRole: Record<string, number> = { STAF_FINANCE: 0, VERIFIKATOR: 0, ADMIN: 0 };
      for (const u of active) byRole[u.role]++;
      out.active_users_by_role = byRole;
    }
    return out;
  }
}
