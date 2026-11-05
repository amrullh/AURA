import { Controller, HttpCode, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { DemoService } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('sample-batch')
  @HttpCode(201)
  @Roles(Role.STAF_FINANCE)
  sample(@CurrentUser() user: AuthUser) {
    return this.demo.sampleBatch(user);
  }

  @Post('reset')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  async reset(@CurrentUser() user: AuthUser) {
    await this.demo.reset(user);
  }
}
