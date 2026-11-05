import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting, User } from '../database/entities';
import { SeedService } from './seed.service';

@Module({ imports: [TypeOrmModule.forFeature([User, Setting])], providers: [SeedService] })
export class SeedModule {}
