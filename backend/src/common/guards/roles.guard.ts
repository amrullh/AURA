import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Err } from '../errors';
import { ROLES_KEY } from '../decorators';
import { Role } from '../enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw Err.forbidden();
    return true;
  }
}
