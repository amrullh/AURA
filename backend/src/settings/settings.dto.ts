import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SettingsUpdateDto {
  @IsOptional() @IsNumber({}, { message: 'Toleransi harga harus berupa angka.' }) @Min(0, { message: 'Toleransi harga minimal 0.' }) @Max(100, { message: 'Toleransi harga maksimal 100.' })
  price_tolerance_pct?: number;

  @IsOptional() @IsNumber({}, { message: 'Ambang keyakinan harus berupa angka.' }) @Min(0, { message: 'Ambang keyakinan minimal 0.' }) @Max(1, { message: 'Ambang keyakinan maksimal 1.' })
  confidence_threshold?: number;

  @IsOptional() @IsNumber({}, { message: 'Menit per invoice harus berupa angka.' }) @Min(0, { message: 'Menit per invoice minimal 0.' })
  manual_minutes_per_invoice?: number;
}
