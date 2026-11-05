import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../common/decorators';
import { AuditAction, MAX_ITERATIONS } from '../common/enums';
import { Setting } from '../database/entities';
import { AuditService, userActor } from '../audit/audit.service';
import { SettingsUpdateDto } from './settings.dto';
import { idNumber } from '../common/format';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    private readonly audit: AuditService,
  ) {}

  /** Baris pengaturan dibuat bila belum ada. */
  async getRow(): Promise<Setting> {
    let row = await this.repo.findOne({ where: { id: 'default' } });
    if (!row) {
      await this.repo.insert({ id: 'default' });
      row = await this.repo.findOneOrFail({ where: { id: 'default' } });
    }
    return row;
  }

  async get() {
    return toSettingsDto(await this.getRow());
  }

  async update(dto: SettingsUpdateDto, user: AuthUser) {
    const row = await this.getRow();
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const apply = <K extends 'priceTolerancePct' | 'confidenceThreshold' | 'manualMinutesPerInvoice'>(
      key: K, label: string, value: number | undefined,
    ) => {
      if (value === undefined || row[key] === value) return;
      changes[label] = { from: row[key], to: value };
      (row[key] as number | null) = value;
    };
    apply('priceTolerancePct', 'price_tolerance_pct', dto.price_tolerance_pct);
    apply('confidenceThreshold', 'confidence_threshold', dto.confidence_threshold);
    apply('manualMinutesPerInvoice', 'manual_minutes_per_invoice', dto.manual_minutes_per_invoice);

    if (Object.keys(changes).length === 0) return toSettingsDto(row);

    row.updatedBy = user.name;
    await this.repo.manager.transaction(async (em) => {
      await em.getRepository(Setting).save(row);
      const parts = Object.entries(changes).map(([k, c]) => `${k} ${typeof c.from === 'number' ? idNumber(c.from, 2) : '-'} menjadi ${idNumber(c.to as number, 2)}`);
      await this.audit.add(
        {
          actor: userActor(user),
          action: AuditAction.SETTINGS_UPDATED,
          objectType: 'SETTINGS',
          objectId: 'settings',
          summary: `Mengubah pengaturan: ${parts.join('; ')}`,
          detail: changes,
        },
        em,
      );
    });
    return toSettingsDto(await this.getRow());
  }
}

export function toSettingsDto(s: Setting) {
  return {
    price_tolerance_pct: s.priceTolerancePct,
    confidence_threshold: s.confidenceThreshold,
    max_iterations: MAX_ITERATIONS,
    manual_minutes_per_invoice: s.manualMinutesPerInvoice,
    updated_at: s.updatedAt?.toISOString() ?? null,
    updated_by: s.updatedBy,
  };
}
