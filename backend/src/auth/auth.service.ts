import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { config } from '../config';
import { AuditAction } from '../common/enums';
import { Err } from '../common/errors';
import { User } from '../database/entities';
import { AuditService, userActor } from '../audit/audit.service';
import { toUserDto } from '../users/users.service';
import { LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email.trim().toLowerCase() } });
    // Pesan sama untuk email salah, sandi salah, dan akun nonaktif, agar tidak membocorkan keberadaan akun.
    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) throw Err.invalidCredentials();

    user.lastLoginAt = new Date();
    await this.users.update(user.id, { lastLoginAt: user.lastLoginAt });
    await this.audit.add({ actor: userActor(user), action: AuditAction.LOGIN, objectType: 'USER', objectId: user.id, summary: `${user.name} masuk` });

    const access_token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { access_token, token_type: 'Bearer', expires_in: config.jwtExpiresInSec(), user: toUserDto(user) };
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw Err.unauthorized();
    return toUserDto(user);
  }
}
