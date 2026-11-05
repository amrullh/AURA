import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { AppError } from '../common/errors';
import { MasterQueryDto } from './master.dto';
import { MasterService } from './master.service';

@Controller('master')
@Roles(Role.ADMIN)
export class MasterController {
  constructor(private readonly master: MasterService) {}

  @Get(':type')
  list(@Param('type') type: string, @Query() q: MasterQueryDto) {
    return this.master.list(type, q);
  }

  /** Belum tersedia. Data master diisi lewat seed (npm run db:seed). Dijawab jelas, bukan 404. */
  @Post(':type/import')
  import(): never {
    throw new AppError(501, 'NOT_IMPLEMENTED', 'Impor CSV belum tersedia. Data master diisi lewat seed.');
  }
}
