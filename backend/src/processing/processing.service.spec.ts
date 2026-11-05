import { ProcessingService } from './processing.service';
import { ProcessingStatus, Role, Verdict } from '../common/enums';

/** Menguji pagar BE: temuan EXCEPTION dengan keyakinan di bawah ambang diserahkan ke Verifikator. */
function build() {
  const updates: any[] = [];
  const em = { getRepository: () => ({ update: async (_w: any, patch: any) => { updates.push(patch); return { affected: 1 }; } }) };
  const repo: any = { manager: { transaction: async (fn: any) => fn(em) } };
  const audit: any = { add: async () => undefined };
  const svc = new ProcessingService(repo, {} as any, {} as any, audit);
  return { svc: svc as any, updates };
}
const inv: any = { id: 'inv_1', confidenceThreshold: 0.7, startedAt: new Date(Date.now() - 1000), processingStatus: ProcessingStatus.PROCESSING };
const result = (verdict: string, confidence: number, extra: any = {}) => ({
  verdict, confidence, iterations: 3, difference_amount: 640000,
  invoice: { invoice_number: 'INV-1', vendor_id: 'ven_003', vendor_name: 'V', po_number: 'PO-1', invoice_date: '2026-10-28', total_amount: 7775000.4 },
  extraction: {}, comparison: {}, tax_check: {}, duplicate: null, investigation: {}, finding: {}, ...extra,
});

describe('ProcessingService.complete', () => {
  it('EXCEPTION dengan keyakinan 0,52 (< 0,70) → NEEDS_REVIEW milik Verifikator', async () => {
    const { svc, updates } = build();
    await svc.complete(inv, result('EXCEPTION', 0.52));
    expect(updates[0]).toMatchObject({ verdict: Verdict.NEEDS_REVIEW, queueOwner: Role.VERIFIKATOR, reviewReason: 'Keyakinan rendah (0,52)', processingStatus: ProcessingStatus.DONE });
  });
  it('EXCEPTION dengan keyakinan 0,86 tetap EXCEPTION milik Staf, uang dibulatkan', async () => {
    const { svc, updates } = build();
    await svc.complete(inv, result('EXCEPTION', 0.86));
    expect(updates[0]).toMatchObject({ verdict: Verdict.EXCEPTION, queueOwner: Role.STAF_FINANCE, reviewReason: null, totalAmount: 7775000 });
  });
  it('batas tepat 0,70 lolos', async () => {
    const { svc, updates } = build();
    await svc.complete(inv, result('EXCEPTION', 0.7));
    expect(updates[0].verdict).toBe(Verdict.EXCEPTION);
  });
  it('agent tidak pernah menghasilkan status keputusan', async () => {
    const { svc, updates } = build();
    await svc.complete(inv, result('CLEAN', 0.99, { decision_status: 'APPROVED' }));
    expect(updates[0].decisionStatus).toBeUndefined();
  });
  it('respons agent tidak valid ditolak', async () => {
    const { svc } = build();
    await expect(svc.complete(inv, result('ASAL', 0.5))).rejects.toThrow('Respons agent tidak valid');
    await expect(svc.complete(inv, result('CLEAN', 1.5))).rejects.toThrow('Respons agent tidak valid');
  });
});
