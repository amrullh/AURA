import { Module } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { ProcessingModule } from '../processing/processing.module';
import { StorageModule } from '../storage/storage.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({ imports: [BatchesModule, ProcessingModule, StorageModule], controllers: [DemoController], providers: [DemoService] })
export class DemoModule {}
