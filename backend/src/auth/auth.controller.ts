import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
