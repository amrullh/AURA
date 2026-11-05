import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }
}
