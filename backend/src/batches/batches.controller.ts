import { Body, Controller, Get, HttpCode, Param, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { config } from '../config';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import { Role } from '../common/enums';
import { PageQueryDto } from '../users/users.dto';
import { BatchesService } from './batches.service';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  list(@Query() q: PageQueryDto) {
    return this.batches.list(q);
  }

  @Get(':batch_id')
  get(@Param('batch_id') id: string) {
    return this.batches.get(id);
  }

  /** multipart/form-data: field `files` (banyak) dan `name` (opsional). Batas per berkas diperiksa di service. */
  @Post()
  @HttpCode(201)
  @Roles(Role.STAF_FINANCE)
  @UseInterceptors(FilesInterceptor('files', config.maxFilesPerBatch(), { limits: { fileSize: 50 * 1024 * 1024 } }))
  create(@UploadedFiles() files: Express.Multer.File[] | undefined, @Body('name') name: string | undefined, @CurrentUser() user: AuthUser) {
    const incoming = (files ?? []).map((f) => ({
      // multer membaca nama berkas sebagai latin1; ubah ke UTF-8 agar nama dengan huruf khusus tidak rusak
      name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
      buffer: f.buffer,
    }));
    return this.batches.create(incoming, typeof name === 'string' ? name : undefined, user);
  }
}
