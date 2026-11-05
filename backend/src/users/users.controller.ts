import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PageQueryDto, UserCreateDto, UserUpdateDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() q: PageQueryDto) {
    return this.users.list(q);
  }

  @Post()
  create(@Body() dto: UserCreateDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Patch(':user_id')
  update(@Param('user_id') id: string, @Body() dto: UserUpdateDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }
}
