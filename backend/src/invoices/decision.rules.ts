import { FindOptionsWhere, In } from 'typeorm';
import { DecisionAction, DecisionStatus, ProcessingStatus, Role, Verdict } from '../common/enums';
import { Invoice } from '../database/entities';

/**
 * ATURAN KEPUTUSAN. Satu-satunya tempat aturan ini ditulis.
 * Dipakai untuk (1) mengisi `allowed_actions` pada respons dan (2) memvalidasi POST /decision.
 *
 * - STAF_FINANCE  : APPROVE / REJECT / ESCALATE pada invoice PENDING berverdict CLEAN, EXCEPTION, DUPLICATE.
 * - VERIFIKATOR   : APPROVE / REJECT (final) pada invoice NEEDS_REVIEW (PENDING) atau ESCALATED.
 * - ADMIN         : tidak boleh memutuskan.
 * - Invoice yang sudah APPROVED / REJECTED tidak dapat diubah lagi.
 * Agent tidak pernah menyetujui pembayaran: tidak ada jalur kode yang mengubah decision_status tanpa pengguna.
 */
export interface InvoiceState {
  processingStatus: ProcessingStatus;
  verdict: Verdict | null;
  decisionStatus: DecisionStatus;
}

const FULL = [DecisionAction.APPROVE, DecisionAction.REJECT, DecisionAction.ESCALATE];
const FINAL = [DecisionAction.APPROVE, DecisionAction.REJECT];

/** Siapa yang berhak memutuskan sekarang. Null bila tidak ada (belum selesai, atau sudah final). */
export function queueOwnerOf(s: InvoiceState): Role | null {
  if (s.processingStatus !== ProcessingStatus.DONE) return null;
  if (s.decisionStatus === DecisionStatus.ESCALATED) return Role.VERIFIKATOR;
  if (s.decisionStatus !== DecisionStatus.PENDING) return null;
  return s.verdict === Verdict.NEEDS_REVIEW ? Role.VERIFIKATOR : Role.STAF_FINANCE;
}

export function allowedActions(role: Role, s: InvoiceState): DecisionAction[] {
  const owner = queueOwnerOf(s);
  if (!owner || owner !== role) return [];
  return role === Role.STAF_FINANCE ? [...FULL] : [...FINAL];
}

export type DecisionOutcome =
  | { ok: true; next: { decisionStatus: DecisionStatus; queueOwner: Role | null; reviewReason: string | null } }
  | { ok: false; status: 403 | 409; code: 'FORBIDDEN' | 'INVALID_TRANSITION'; message: string };

export function evaluateDecision(role: Role, action: DecisionAction, s: InvoiceState): DecisionOutcome {
  if (role === Role.ADMIN) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Admin tidak dapat mengambil keputusan invoice.' };
  }
  if (s.processingStatus !== ProcessingStatus.DONE) {
    return { ok: false, status: 409, code: 'INVALID_TRANSITION', message: 'Invoice belum selesai diproses.' };
  }
  if (s.decisionStatus === DecisionStatus.APPROVED || s.decisionStatus === DecisionStatus.REJECTED) {
    return { ok: false, status: 409, code: 'INVALID_TRANSITION', message: 'Invoice sudah diputuskan dan tidak dapat diubah.' };
  }
  if (role === Role.VERIFIKATOR && action === DecisionAction.ESCALATE) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Verifikator tidak dapat melakukan eskalasi.' };
  }
  if (!allowedActions(role, s).includes(action)) {
    const owner = queueOwnerOf(s);
    const message =
      role === Role.STAF_FINANCE && owner === Role.VERIFIKATOR
        ? 'Invoice ini hanya dapat diputuskan oleh Verifikator.'
        : 'Invoice ini tidak berada dalam antrean Anda.';
    return { ok: false, status: 403, code: 'FORBIDDEN', message };
  }

  switch (action) {
    case DecisionAction.APPROVE:
      return { ok: true, next: { decisionStatus: DecisionStatus.APPROVED, queueOwner: null, reviewReason: null } };
    case DecisionAction.REJECT:
      return { ok: true, next: { decisionStatus: DecisionStatus.REJECTED, queueOwner: null, reviewReason: null } };
    case DecisionAction.ESCALATE:
      return { ok: true, next: { decisionStatus: DecisionStatus.ESCALATED, queueOwner: Role.VERIFIKATOR, reviewReason: 'Eskalasi dari Staf' } };
  }
}

/** Kondisi SQL untuk "antrean saya" (queue=mine). Array berarti OR. Admin tidak punya antrean. */
export function myQueueWhere(role: Role): FindOptionsWhere<Invoice>[] | null {
  const done = ProcessingStatus.DONE;
  switch (role) {
    case Role.STAF_FINANCE:
      return [{ processingStatus: done, decisionStatus: DecisionStatus.PENDING, verdict: In([Verdict.CLEAN, Verdict.EXCEPTION, Verdict.DUPLICATE]) }];
    case Role.VERIFIKATOR:
      return [
        { processingStatus: done, decisionStatus: DecisionStatus.PENDING, verdict: Verdict.NEEDS_REVIEW },
        { processingStatus: done, decisionStatus: DecisionStatus.ESCALATED },
      ];
    default:
      return null;
  }
}
