import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Format email tidak valid.' }) email!: string;
  @IsString({ message: 'Kata sandi wajib diisi.' }) @IsNotEmpty({ message: 'Kata sandi wajib diisi.' }) password!: string;
}
