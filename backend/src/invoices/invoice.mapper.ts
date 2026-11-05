import { Decision, Invoice } from '../database/entities';
import { DecisionStatus, ProcessingStatus, Role } from '../common/enums';
import { allowedActions } from './decision.rules';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Satu-satunya tempat yang menyusun bentuk respons invoice sesuai openapi.yaml. */
export function toListItem(inv: Invoice, role: Role) {
  return {
    id: inv.id,
    batch_id: inv.batchId,
    invoice_number: inv.invoiceNumber,
    vendor_id: inv.vendorId,
    vendor_name: inv.vendorName,
    po_number: inv.poNumber,
    invoice_date: inv.invoiceDate,
    total_amount: inv.totalAmount,
    difference_amount: inv.differenceAmount,
    processing_status: inv.processingStatus,
    iteration: inv.iteration,
    verdict: inv.verdict,
    confidence: inv.confidence,
    decision_status: inv.decisionStatus,
    queue_owner: inv.queueOwner,
    review_reason: inv.reviewReason,
    allowed_actions: allowedActions(role, inv),
    created_at: inv.createdAt.toISOString(),
    processed_at: iso(inv.finishedAt),
  };
}

export function toDetail(inv: Invoice, role: Role, decisions: Decision[]) {
  const a = inv.analysis ?? {};
  const sorted = [...decisions].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  const history: any[] = [];

  if (inv.processingStatus === ProcessingStatus.DONE && inv.finishedAt) {
    history.push({
      id: `dec_agent_${inv.id}`,
      actor: { type: 'AGENT', id: 'agent', name: 'Agent' },
      action: 'PROCESSED',
      reason: `Selesai diproses, verdict ${inv.verdict}`,
      created_at: inv.finishedAt.toISOString(),
    });
  }
  for (const d of sorted) {
    history.push({
      id: d.id,
      actor: { type: 'USER', id: d.actorId, name: d.actorName, role: d.actorRole },
      action: d.action,
      reason: d.reason,
      created_at: d.createdAt.toISOString(),
    });
  }

  const lastEscalation = [...sorted].reverse().find((d) => d.action === 'ESCALATE');
  const escalation = lastEscalation
    ? { by_name: lastEscalation.actorName, reason: lastEscalation.reason, at: lastEscalation.createdAt.toISOString() }
    : null;

  return {
    ...toListItem(inv, role),
    file: {
      content_type: inv.contentType,
      page_count: inv.pageCount,
      url: `/api/invoices/${inv.id}/file`,
    },
    processing: {
      started_at: iso(inv.startedAt),
      finished_at: iso(inv.finishedAt),
      duration_ms: inv.durationMs,
      error_message: inv.errorMessage,
    },
    extraction: a.extraction ?? null,
    comparison: a.comparison ?? null,
    tax_check: a.tax_check ?? null,
    duplicate: a.duplicate ?? null,
    investigation: a.investigation ?? null,
    finding: a.finding ?? null,
    escalation,
    decisions: history,
  };
}

/** Bantuan untuk pengujian: apakah invoice sudah final. */
export const isFinal = (s: DecisionStatus) => s === DecisionStatus.APPROVED || s === DecisionStatus.REJECTED;
