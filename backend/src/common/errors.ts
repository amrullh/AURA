import { HttpException } from '@nestjs/common';

export interface ErrorDetail {
  field?: string;
  message: string;
}

/** Error aplikasi dengan kode mesin (code) dan pesan Indonesia (message). */
export class AppError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super({ code, message, details }, status);
  }
}

export const Err = {
  unauthorized: (m = 'Sesi berakhir, silakan masuk lagi.') => new AppError(401, 'UNAUTHORIZED', m),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi salah.'),
  forbidden: (m = 'Anda tidak berwenang melakukan aksi ini.') => new AppError(403, 'FORBIDDEN', m),
  notFound: (m = 'Data tidak ditemukan.') => new AppError(404, 'NOT_FOUND', m),
  validation: (m: string, details?: ErrorDetail[]) => new AppError(400, 'VALIDATION_ERROR', m, details),
  invalidTransition: (m: string) => new AppError(409, 'INVALID_TRANSITION', m),
  conflict: (code: string, m: string) => new AppError(409, code, m),
};
