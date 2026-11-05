import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MinLength, Min } from 'class-validator';
import { Role } from '../common/enums';

export class UserCreateDto {
  @IsString({ message: 'Nama wajib diisi.' }) @IsNotEmpty({ message: 'Nama wajib diisi.' }) name!: string;
  @IsEmail({}, { message: 'Format email tidak valid.' }) email!: string;
  @IsEnum(Role, { message: 'Peran tidak valid.' }) role!: Role;
  @IsString({ message: 'Kata sandi wajib diisi.' }) @MinLength(8, { message: 'Kata sandi minimal 8 karakter.' }) password!: string;
}

export class UserUpdateDto {
  @IsOptional() @IsEnum(Role, { message: 'Peran tidak valid.' }) role?: Role;
  @IsOptional() @IsBoolean({ message: 'is_active harus true atau false.' }) is_active?: boolean;
}

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page harus bilangan bulat.' }) @Min(1, { message: 'page minimal 1.' }) page?: number;
  @IsOptional() @Type(() => Number) @IsInt({ message: 'page_size harus bilangan bulat.' }) @Min(1, { message: 'page_size minimal 1.' }) @Max(100, { message: 'page_size maksimal 100.' }) page_size?: number;
}
