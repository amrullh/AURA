import { Controller, Get, Query } from '@nestjs/common';
import { MetricsQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Semua peran boleh melihat (layar Laporan ada di menu ketiganya). */
  @Get('metrics')
  metrics(@Query() q: MetricsQueryDto) {
    return this.reports.metrics(q);
  }
}
