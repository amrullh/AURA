import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DecisionAction, DecisionStatus, ProcessingStatus, Verdict } from '../common/enums';

export const SORT_FIELDS: Record<string, keyof import('../database/entities').Invoice> = {
  created_at: 'createdAt',
  processed_at: 'finishedAt',
  difference_amount: 'differenceAmount',
  total_amount: 'totalAmount',
  confidence: 'confidence',
  invoice_date: 'invoiceDate',
  invoice_number: 'invoiceNumber',
};

export class InvoiceQueryDto {
  @IsOptional() @IsString() batch_id?: string;
  @IsOptional() @IsIn(['mine'], { message: 'queue hanya boleh bernilai "mine".' }) queue?: 'mine';
  @IsOptional() @IsEnum(ProcessingStatus, { message: 'processing_status tidak valid.' }) processing_status?: ProcessingStatus;
  @IsOptional() @IsEnum(Verdict, { message: 'verdict tidak valid.' }) verdict?: Verdict;
  @IsOptional() @IsEnum(DecisionStatus, { message: 'decision_status tidak valid.' }) decision_status?: DecisionStatus;
  @IsOptional() @IsString() vendor_id?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page harus bilangan bulat.' }) @Min(1, { message: 'page minimal 1.' }) page?: number;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page_size harus bilangan bulat.' }) @Min(1, { message: 'page_size minimal 1.' }) @Max(100, { message: 'page_size maksimal 100.' }) page_size?: number;
}

export class DecisionDto {
  @IsEnum(DecisionAction, { message: 'Aksi tidak valid. Gunakan APPROVE, REJECT, atau ESCALATE.' }) action!: DecisionAction;
  @IsString({ message: 'Alasan wajib diisi.' })
  @IsNotEmpty({ message: 'Alasan wajib diisi.' })
  @MinLength(3, { message: 'Alasan minimal 3 karakter.' })
  @MaxLength(1000, { message: 'Alasan maksimal 1000 karakter.' })
  reason!: string;
}
