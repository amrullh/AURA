import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser, AuthUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { SettingsUpdateDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  @Roles(Role.ADMIN)
  update(@Body() dto: SettingsUpdateDto, @CurrentUser() user: AuthUser) {
    return this.settings.update(dto, user);
  }
}
