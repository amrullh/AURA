import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Batch, Invoice } from '../database/entities';
import { ProcessingModule } from '../processing/processing.module';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';

@Module({
  imports: [TypeOrmModule.forFeature([Batch, Invoice]), ProcessingModule],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
