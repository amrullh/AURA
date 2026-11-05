import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AuthUser } from '../common/decorators';
import { AuditAction } from '../common/enums';
import { Err } from '../common/errors';
import { newId } from '../common/id';
import { pageOf, skipOf } from '../common/pagination';
import { User } from '../database/entities';
import { AuditService, userActor } from '../audit/audit.service';
import { PageQueryDto, UserCreateDto, UserUpdateDto } from './users.dto';

export function toUserDto(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_active: u.isActive,
    last_login_at: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  async list(q: PageQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 20;
    const [rows, total] = await this.repo.findAndCount({ order: { createdAt: 'ASC' }, skip: skipOf(page, pageSize), take: pageSize });
    return pageOf(rows.map(toUserDto), page, pageSize, total);
  }

  async create(dto: UserCreateDto, actor: AuthUser) {
    const email = dto.email.trim().toLowerCase();
    if (await this.repo.exist({ where: { email } })) throw Err.conflict('EMAIL_TAKEN', 'Email sudah dipakai pengguna lain.');
    const user = this.repo.create({
      id: newId('usr'),
      name: dto.name.trim(),
      email,
      role: dto.role,
      passwordHash: await bcrypt.hash(dto.password, 10),
      isActive: true,
      lastLoginAt: null,
    });
    await this.repo.manager.transaction(async (em) => {
      await em.getRepository(User).save(user);
      await this.audit.add(
        {
          actor: userActor(actor), action: AuditAction.USER_CREATED, objectType: 'USER', objectId: user.id,
          summary: `Menambah pengguna ${user.name} (${user.role})`, detail: { email, role: user.role },
        },
        em,
      );
    });
    return toUserDto(user);
  }

  async update(id: string, dto: UserUpdateDto, actor: AuthUser) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw Err.notFound('Pengguna tidak ditemukan.');
    if (id === actor.id) {
      if (dto.is_active === false) throw Err.forbidden('Anda tidak dapat menonaktifkan akun sendiri.');
      if (dto.role !== undefined && dto.role !== user.role) throw Err.forbidden('Anda tidak dapat mengubah peran akun sendiri.');
    }
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (dto.role !== undefined && dto.role !== user.role) { changes.role = { from: user.role, to: dto.role }; user.role = dto.role; }
    if (dto.is_active !== undefined && dto.is_active !== user.isActive) { changes.is_active = { from: user.isActive, to: dto.is_active }; user.isActive = dto.is_active; }
    if (Object.keys(changes).length === 0) return toUserDto(user);

    await this.repo.manager.transaction(async (em) => {
      await em.getRepository(User).save(user);
      await this.audit.add(
        {
          actor: userActor(actor), action: AuditAction.USER_UPDATED, objectType: 'USER', objectId: user.id,
          summary: `Mengubah pengguna ${user.name}`, detail: changes,
        },
        em,
      );
    });
    return toUserDto(user);
  }
}
