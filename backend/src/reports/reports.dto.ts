import { IsDateString, IsOptional, IsString } from 'class-validator';

export class MetricsQueryDto {
  @IsOptional() @IsString() batch_id?: string;
  @IsOptional() @IsDateString({ strict: false }, { message: 'from harus berformat tanggal (YYYY-MM-DD).' }) from?: string;
  @IsOptional() @IsDateString({ strict: false }, { message: 'to harus berformat tanggal (YYYY-MM-DD).' }) to?: string;
}
