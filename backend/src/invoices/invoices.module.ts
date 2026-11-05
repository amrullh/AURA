import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Decision, Invoice } from '../database/entities';
import { ProcessingModule } from '../processing/processing.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, Decision]), ProcessingModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
