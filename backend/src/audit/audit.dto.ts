import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsDateString, Max, Min } from 'class-validator';
import { ActorType, AuditAction } from '../common/enums';

export class AuditQueryDto {
  @IsOptional() @IsEnum(ActorType, { message: 'actor_type tidak valid.' }) actor_type?: ActorType;
  @IsOptional() @IsEnum(AuditAction, { message: 'action tidak valid.' }) action?: AuditAction;
  @IsOptional() @IsDateString({ strict: false }, { message: 'from harus berformat tanggal (YYYY-MM-DD).' }) from?: string;
  @IsOptional() @IsDateString({ strict: false }, { message: 'to harus berformat tanggal (YYYY-MM-DD).' }) to?: string;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page harus bilangan bulat.' }) @Min(1, { message: 'page minimal 1.' }) page?: number;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page_size harus bilangan bulat.' }) @Min(1, { message: 'page_size minimal 1.' }) @Max(100, { message: 'page_size maksimal 100.' }) page_size?: number;
}
