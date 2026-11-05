import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BatchesModule } from './batches/batches.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { config } from './config';
import { DashboardModule } from './dashboard/dashboard.module';
import { ALL_ENTITIES, User } from './database/entities';
import { DemoModule } from './demo/demo.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MasterModule } from './master/master.module';
import { ReportsModule } from './reports/reports.module';
import { ProcessingModule } from './processing/processing.module';
import { SeedModule } from './seed/seed.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({ type: 'postgres', url: config.databaseUrl(), entities: ALL_ENTITIES, synchronize: config.dbSync() }),
    TypeOrmModule.forFeature([User]),
    AuditModule,
    SettingsModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ProcessingModule,
    BatchesModule,
    InvoicesModule,
    DashboardModule,
    ReportsModule,
    MasterModule,
    DemoModule,
    SeedModule,
  ],
  providers: [
    // Urutan penting: autentikasi dulu, baru pemeriksaan peran.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
