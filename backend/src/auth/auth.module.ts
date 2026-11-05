import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities';
import { config } from '../config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User]), JwtModule.register({ global: true, secret: config.jwtSecret(), signOptions: { expiresIn: config.jwtExpiresInSec() } })],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
