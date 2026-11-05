import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class MasterQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page harus bilangan bulat.' }) @Min(1, { message: 'page minimal 1.' }) page?: number;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page_size harus bilangan bulat.' }) @Min(1, { message: 'page_size minimal 1.' }) @Max(100, { message: 'page_size maksimal 100.' }) page_size?: number;
}
