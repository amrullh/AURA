import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../enums';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
