import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, IsNull, Repository } from 'typeorm';
import { config } from '../../config';
import { ProcessingStatus, Verdict } from '../../common/enums';
import { Invoice } from '../../database/entities';
import { AgentClient, AgentError, AgentHooks, AgentRequest, AgentResult } from '../agent.types';
import scenarios from './scenarios.json';

type ScenarioKey = 'clean' | 'exception' | 'duplicate' | 'needs_review' | 'gagal';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const hashNum = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Pilih skenario dari kata kunci pada nama berkas; selain itu sebaran tetap berdasarkan id. */
export function pickScenario(fileName: string, invoiceId: string): ScenarioKey {
  const n = fileName.toLowerCase();
  if (n.includes('gagal')) return 'gagal';
  if (n.includes('duplicate') || n.includes('duplikat')) return 'duplicate';
  if (n.includes('exception') || n.includes('pengecualian')) return 'exception';
  if (n.includes('review') || n.includes('tinjau')) return 'needs_review';
  if (n.includes('clean') || n.includes('bersih')) return 'clean';
  const r = hashNum(invoiceId) % 20; // 55% clean, 25% exception, 5% duplicate, 15% review
  if (r < 11) return 'clean';
  if (r < 16) return 'exception';
  if (r < 17) return 'duplicate';
  return 'needs_review';
}

/**
 * AGENT TIRUAN untuk pengembangan BE dan FE sebelum agent sungguhan siap.
 * Mengembalikan hasil contoh (dari mock-data.json) dengan jeda dan iterasi yang disimulasikan.
 * Aktif bila AGENT_MODE=stub (bawaan). Ganti dengan AGENT_MODE=http saat agent siap.
 */
@Injectable()
export class StubAgentClient extends AgentClient {
  constructor(@InjectRepository(Invoice) private readonly invoices: Repository<Invoice>) {
    super();
  }

  async process(req: AgentRequest, hooks?: AgentHooks): Promise<AgentResult> {
    const key = pickScenario(req.file_name, req.invoice_id);
    const delay = config.stubDelayMs();

    if (key === 'gagal') {
      await sleep(delay);
      throw new AgentError('Berkas tidak terbaca: gambar terlalu buram setelah 2 kali percobaan ekstraksi.');
    }

    let sc = clone(scenarios[key]) as unknown as AgentResult & { duplicate: any; extraction: any };
    let baseNumber = sc.invoice.invoice_number as string;

    const iterations = sc.iterations;
    const slice = delay / (iterations + 1);
    for (let i = 1; i <= iterations; i++) {
      await sleep(slice);
      await hooks?.onProgress?.(i);
    }
    await sleep(slice);

    if (key === 'duplicate') {
      const original = await this.waitForOriginal();
      if (!original) {
        // Belum ada invoice lain untuk ditiru: jatuh ke skenario bersih.
        sc = clone(scenarios.clean) as any;
        baseNumber = sc.invoice.invoice_number as string;
      } else {
        sc.invoice = {
          invoice_number: original.invoiceNumber,
          vendor_id: original.vendorId,
          vendor_name: original.vendorName,
          po_number: original.poNumber,
          invoice_date: original.invoiceDate,
          total_amount: original.totalAmount,
        };
        sc.duplicate = {
          original_invoice_id: original.id,
          original_invoice_number: original.invoiceNumber,
          original_total_amount: original.totalAmount,
          original_created_at: original.createdAt.toISOString(),
          match_basis: ['invoice_number', 'total_amount', 'vendor'],
        };
        this.patchExtraction(sc, original);
        this.patchText(sc, baseNumber, original.invoiceNumber ?? baseNumber);
        return sc;
      }
    }

    // Nomor invoice dibuat unik per invoice supaya demo tidak penuh nomor yang sama.
    const unique = `INV-2026-${String(1000 + (hashNum(req.invoice_id) % 9000))}`;
    sc.invoice.invoice_number = unique;
    this.patchText(sc, baseNumber, unique);
    return sc;
  }

  private async waitForOriginal(): Promise<Invoice | null> {
    for (let i = 0; i < 15; i++) {
      const found = await this.invoices.findOne({
        where: { processingStatus: ProcessingStatus.DONE, verdict: In([Verdict.CLEAN, Verdict.EXCEPTION]), invoiceNumber: Not(IsNull()) },
        order: { finishedAt: 'DESC' },
      });
      if (found) return found;
      await sleep(1000);
    }
    return null;
  }

  private patchExtraction(sc: any, o: Invoice) {
    for (const f of sc.extraction?.fields ?? []) {
      if (f.key === 'invoice_number') f.value = o.invoiceNumber;
      if (f.key === 'vendor_name') f.value = o.vendorName;
      if (f.key === 'po_number') f.value = o.poNumber;
      if (f.key === 'total_amount') f.value = String(o.totalAmount);
    }
  }

  /** Ganti nomor invoice contoh di seluruh teks (kutipan bukti, ekstraksi, temuan). */
  private patchText(sc: any, from: string, to: string) {
    if (from === to) return;
    const patched = JSON.parse(JSON.stringify(sc).split(from).join(to));
    for (const k of Object.keys(patched)) sc[k] = patched[k];
  }
}
