import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { AuthUser } from '../common/decorators';
import { AuditAction } from '../common/enums';
import { BatchesService } from '../batches/batches.service';
import { AuditService, userActor } from '../audit/audit.service';
import { Invoice } from '../database/entities';
import { ProcessingService } from '../processing/processing.service';
import { resetSettings, seedMaster } from '../seed/master-data';
import { StorageService } from '../storage/storage.service';
import { makePdf } from './pdf';

// Nama berkas menentukan hasil pada agent tiruan. "duplicate" diletakkan paling akhir agar asli sudah ada.
const SAMPLE_FILES = [
  ...Array.from({ length: 6 }, (_, i) => `demo_clean_${String(i + 1).padStart(2, '0')}.pdf`),
  ...Array.from({ length: 3 }, (_, i) => `demo_exception_${String(i + 1).padStart(2, '0')}.pdf`),
  'demo_review_01.pdf',
  'demo_gagal_01.pdf',
  'demo_duplicate_01.pdf',
];

@Injectable()
export class DemoService {
  constructor(
    private readonly batches: BatchesService,
    private readonly audit: AuditService,
    private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly processing: ProcessingService,
  ) {}

  /** Membuat batch contoh dari PDF sintetis lewat jalur unggah yang sama dengan unggahan biasa. */
  sampleBatch(user: AuthUser) {
    const nonce = randomBytes(4).toString('hex');
    const files = SAMPLE_FILES.map((name, i) => ({
      name,
      buffer: makePdf([
        'INVOICE CONTOH (DATA SINTETIS)',
        `Berkas : ${name}`,
        `Nomor  : DEMO-${nonce}-${i + 1}`,
        'Catatan: dibuat otomatis untuk demo, bukan dokumen nyata.',
      ]),
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
