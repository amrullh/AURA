import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../errors';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'VALIDATION_ERROR',
};

/** Semua error keluar dalam bentuk { error: { code, message, details? } }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      const error: Record<string, unknown> = { code: exception.code, message: exception.message };
      if (exception.details?.length) error.details = exception.details;
      return res.status(exception.getStatus()).json({ error });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      let message = exception.message;
      if (status === 404) message = 'Data tidak ditemukan.';
      else if (status === 413) message = 'Berkas terlalu besar.';
      else if (status === 400 && /unexpected field/i.test(message)) message = 'Jumlah berkas melebihi batas per batch.';
      else if (status === 401) message = 'Sesi berakhir, silakan masuk lagi.';
      else if (status === 403) message = 'Anda tidak berwenang melakukan aksi ini.';
      return res.status(status).json({ error: { code: CODE_BY_STATUS[status] ?? 'ERROR', message } });
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server.' } });
  }
}
