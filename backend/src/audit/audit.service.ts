import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ActorType, AuditAction } from '../common/enums';
import { newId } from '../common/id';
import { pageOf, skipOf } from '../common/pagination';
import { AuditLog } from '../database/entities';
import { AuditQueryDto } from './audit.dto';

export interface AuditActor {
  type: ActorType;
  id: string;
  name: string;
}

export const AGENT_ACTOR: AuditActor = { type: ActorType.AGENT, id: 'agent', name: 'Agent' };
export const userActor = (u: { id: string; name: string }): AuditActor => ({ type: ActorType.USER, id: u.id, name: u.name });

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  objectType: string;
  objectId: string;
  summary: string;
  detail?: Record<string, unknown> | null;
}

/** Hanya ada metode tambah dan baca. Jangan menambahkan ubah atau hapus. */
@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Berikan `manager` bila harus ikut dalam transaksi yang sama dengan perubahan datanya. */
  async add(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.repo;
    await repo.insert({
      id: newId('aud'),
      actorType: entry.actor.type,
      actorId: entry.actor.id,
      actorName: entry.actor.name,
      action: entry.action,
      objectType: entry.objectType,
      objectId: entry.objectId,
      summary: entry.summary,
      detail: (entry.detail as Record<string, any>) ?? null,
    });
  }

  async list(q: AuditQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 20;
    const where: FindOptionsWhere<AuditLog> = {};
    if (q.actor_type) where.actorType = q.actor_type;
    if (q.action) where.action = q.action;
    if (q.from && q.to) where.createdAt = Between(new Date(`${q.from}T00:00:00+07:00`), new Date(`${q.to}T23:59:59.999+07:00`));
    else if (q.from) where.createdAt = MoreThanOrEqual(new Date(`${q.from}T00:00:00+07:00`));
    else if (q.to) where.createdAt = LessThanOrEqual(new Date(`${q.to}T23:59:59.999+07:00`));

    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: skipOf(page, pageSize),
      take: pageSize,
    });
    return pageOf(rows.map(toAuditLogDto), page, pageSize, total);
  }
}

export function toAuditLogDto(a: AuditLog) {
  return {
    id: a.id,
    created_at: a.createdAt.toISOString(),
    actor: { type: a.actorType, id: a.actorId, name: a.actorName },
    action: a.action,
    object_type: a.objectType,
    object_id: a.objectId,
    summary: a.summary,
    detail: a.detail ?? {},
  };
}
