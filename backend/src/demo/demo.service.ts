import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { AuthUser } from '../common/decorators';
import { AuditAction } from '../common/enums';
import { BatchesService } from '../batches/batches.service';
import { AuditService, userActor } from '../audit/audit.service';
import { Invoice } from '../database/entities';
import { ProcessingService } from '../processing/processing.service';
import { resetSettings, seedDemoDuplicate, seedMaster } from '../seed/master-data';
import { StorageService } from '../storage/storage.service';
import { makePdf } from './pdf';
import { brokenPdf, sampleScenarios } from './scenarios';

@Injectable()
export class DemoService {
  constructor(
    private readonly batches: BatchesService,
    private readonly audit: AuditService,
    private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly processing: ProcessingService,
  ) {}

  /**
   * Membuat batch contoh dari PDF sintetis lewat jalur unggah yang sama dengan unggahan biasa.
   * Isi dokumen mengikuti skenario nyata (clean/exception/review/duplicate/gagal) supaya
   * agent sungguhan benar-benar mencocokkan isi berkas, bukan menebak dari nama.
   */
  sampleBatch(user: AuthUser) {
    const nonce = randomBytes(3).toString('hex');
    const files = sampleScenarios(nonce).map((s) => ({
      name: s.name,
      buffer: s.lines.length ? makePdf(s.lines) : brokenPdf(),
    }));
    return this.batches.create(files, 'Batch contoh (data demo)', user);
  }

  /** Menghapus batch, invoice, dan keputusan; mengisi ulang data master dan pengaturan. Jejak audit dipertahankan. */
  async reset(user: AuthUser) {
    const paths = (await this.ds.getRepository(Invoice).find({ select: { filePath: true } })).map((i) => i.filePath);
    await this.ds.transaction(async (em) => {
      await em.query('DELETE FROM decisions');
      await em.query('DELETE FROM invoices');
      await em.query('DELETE FROM batches');
      await seedMaster(em);
      await seedDemoDuplicate(em);
      await resetSettings(em);
      await this.audit.add(
        { actor: userActor(user), action: AuditAction.DEMO_RESET, objectType: 'SYSTEM', objectId: 'demo', summary: 'Mengatur ulang data demo' },
        em,
      );
    });
    await Promise.all(paths.map((p) => this.storage.remove(p)));
    this.processing.kick();
  }
}
