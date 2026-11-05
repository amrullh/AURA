import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Err } from '../errors';
import { IS_PUBLIC } from '../decorators';
import { User } from '../../database/entities';

/** Guard global: semua endpoint butuh token kecuali yang ditandai @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw Err.unauthorized();

    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw Err.unauthorized();
    }

    // Peran dibaca dari database setiap permintaan, jadi perubahan peran atau penonaktifan langsung berlaku.
    const user = await this.users.findOne({ where: { id: sub } });
    if (!user || !user.isActive) throw Err.unauthorized();
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return true;
  }
}
