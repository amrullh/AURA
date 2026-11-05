import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Decision, Invoice } from '../database/entities';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ imports: [TypeOrmModule.forFeature([Invoice, Decision])], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
