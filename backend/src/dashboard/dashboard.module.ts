import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchesModule } from '../batches/batches.module';
import { Decision, Invoice, User } from '../database/entities';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, Decision, User]), BatchesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
