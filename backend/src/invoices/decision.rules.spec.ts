import { DecisionAction as A, DecisionStatus as D, ProcessingStatus as P, Role, Verdict as V } from '../common/enums';
import { allowedActions, evaluateDecision, InvoiceState, queueOwnerOf } from './decision.rules';

const st = (verdict: V | null, decisionStatus = D.PENDING, processingStatus = P.DONE): InvoiceState => ({ processingStatus, verdict, decisionStatus });
const ALL = [A.APPROVE, A.REJECT, A.ESCALATE];

describe('allowedActions', () => {
  it.each([V.CLEAN, V.EXCEPTION, V.DUPLICATE])('Staf boleh Setujui/Tolak/Eskalasi pada %s yang PENDING', (v) => {
    expect(allowedActions(Role.STAF_FINANCE, st(v))).toEqual(ALL);
  });
  it('Staf tidak boleh apa pun pada NEEDS_REVIEW', () => {
    expect(allowedActions(Role.STAF_FINANCE, st(V.NEEDS_REVIEW))).toEqual([]);
  });
  it('Verifikator hanya Setujui/Tolak pada NEEDS_REVIEW dan ESCALATED', () => {
    expect(allowedActions(Role.VERIFIKATOR, st(V.NEEDS_REVIEW))).toEqual([A.APPROVE, A.REJECT]);
    expect(allowedActions(Role.VERIFIKATOR, st(V.EXCEPTION, D.ESCALATED))).toEqual([A.APPROVE, A.REJECT]);
  });
  it('Verifikator tidak boleh pada invoice CLEAN/EXCEPTION yang belum dieskalasi', () => {
    expect(allowedActions(Role.VERIFIKATOR, st(V.EXCEPTION))).toEqual([]);
  });
  it('Staf tidak boleh lagi setelah dieskalasi', () => {
    expect(allowedActions(Role.STAF_FINANCE, st(V.EXCEPTION, D.ESCALATED))).toEqual([]);
  });
  it('Admin tidak pernah boleh', () => {
    for (const v of Object.values(V)) expect(allowedActions(Role.ADMIN, st(v))).toEqual([]);
  });
  it.each([D.APPROVED, D.REJECTED])('tidak ada aksi pada invoice %s', (d) => {
    for (const r of Object.values(Role)) expect(allowedActions(r, st(V.CLEAN, d))).toEqual([]);
  });
  it.each([P.QUEUED, P.PROCESSING, P.FAILED])('tidak ada aksi saat %s', (p) => {
    for (const r of Object.values(Role)) expect(allowedActions(r, st(null, D.PENDING, p))).toEqual([]);
  });
});

describe('queueOwnerOf', () => {
  it('menentukan pemilik antrean', () => {
    expect(queueOwnerOf(st(V.CLEAN))).toBe(Role.STAF_FINANCE);
    expect(queueOwnerOf(st(V.NEEDS_REVIEW))).toBe(Role.VERIFIKATOR);
    expect(queueOwnerOf(st(V.EXCEPTION, D.ESCALATED))).toBe(Role.VERIFIKATOR);
    expect(queueOwnerOf(st(V.EXCEPTION, D.APPROVED))).toBeNull();
    expect(queueOwnerOf(st(null, D.PENDING, P.PROCESSING))).toBeNull();
  });
});

describe('evaluateDecision', () => {
  it('Staf menyetujui CLEAN → APPROVED, antrean kosong', () => {
    expect(evaluateDecision(Role.STAF_FINANCE, A.APPROVE, st(V.CLEAN))).toEqual({
      ok: true, next: { decisionStatus: D.APPROVED, queueOwner: null, reviewReason: null },
    });
  });
  it('Staf eskalasi → ESCALATED milik Verifikator dengan alasan', () => {
    expect(evaluateDecision(Role.STAF_FINANCE, A.ESCALATE, st(V.EXCEPTION))).toEqual({
      ok: true, next: { decisionStatus: D.ESCALATED, queueOwner: Role.VERIFIKATOR, reviewReason: 'Eskalasi dari Staf' },
    });
  });
  it('Verifikator tidak boleh eskalasi → 403', () => {
    expect(evaluateDecision(Role.VERIFIKATOR, A.ESCALATE, st(V.NEEDS_REVIEW))).toMatchObject({ ok: false, status: 403, code: 'FORBIDDEN' });
  });
  it('Admin → 403', () => {
    expect(evaluateDecision(Role.ADMIN, A.APPROVE, st(V.CLEAN))).toMatchObject({ ok: false, status: 403 });
  });
  it('Staf pada NEEDS_REVIEW → 403 (bukan wewenangnya)', () => {
    expect(evaluateDecision(Role.STAF_FINANCE, A.APPROVE, st(V.NEEDS_REVIEW))).toMatchObject({ ok: false, status: 403 });
  });
  it.each([D.APPROVED, D.REJECTED])('invoice %s tidak dapat diubah → 409', (d) => {
    expect(evaluateDecision(Role.STAF_FINANCE, A.APPROVE, st(V.CLEAN, d))).toMatchObject({ ok: false, status: 409, code: 'INVALID_TRANSITION' });
  });
  it('invoice belum selesai diproses → 409', () => {
    expect(evaluateDecision(Role.STAF_FINANCE, A.APPROVE, st(null, D.PENDING, P.PROCESSING))).toMatchObject({ ok: false, status: 409 });
  });
  it('Verifikator memutuskan invoice ESCALATED → final', () => {
    expect(evaluateDecision(Role.VERIFIKATOR, A.REJECT, st(V.EXCEPTION, D.ESCALATED))).toMatchObject({
      ok: true, next: { decisionStatus: D.REJECTED },
    });
  });
});
