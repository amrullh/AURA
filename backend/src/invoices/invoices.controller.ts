import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { DecisionDto, InvoiceQueryDto } from './invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@Query() q: InvoiceQueryDto, @CurrentUser() user: AuthUser) {
    return this.invoices.list(q, user);
  }

  @Get(':invoice_id')
  get(@Param('invoice_id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.get(id, user);
  }

  @Get(':invoice_id/file')
  async file(@Param('invoice_id') id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.invoices.file(id);
    res.set({
      'Content-Type': f.contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(f.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    });
    return new StreamableFile(f.buffer);
  }

  @Post(':invoice_id/decision')
  @HttpCode(200)
  @Roles(Role.STAF_FINANCE, Role.VERIFIKATOR)
  decide(@Param('invoice_id') id: string, @Body() dto: DecisionDto, @CurrentUser() user: AuthUser) {
    return this.invoices.decide(id, dto, user);
  }

  @Post(':invoice_id/retry')
  @HttpCode(202)
  @Roles(Role.STAF_FINANCE, Role.ADMIN)
  retry(@Param('invoice_id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.retry(id, user);
  }
}
