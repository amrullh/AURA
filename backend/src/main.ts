import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { existsSync, readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Err } from './common/errors';
import { config } from './config';

function flatten(errors: ValidationError[]): { field: string; message: string }[] {
  const out: { field: string; message: string }[] = [];
  for (const e of errors) {
    if (e.constraints) out.push({ field: e.property, message: Object.values(e.constraints)[0] });
    if (e.children?.length) out.push(...flatten(e.children));
  }
  return out;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) => {
        const details = flatten(errors);
        return Err.validation(details[0]?.message ?? 'Input tidak valid.', details);
      },
    }),
  );

  // Dokumentasi interaktif dari berkas kontrak yang sama dengan yang dipakai FE (docs/api/openapi.yaml).
  const specPath = path.resolve(config.openapiPath());
  if (existsSync(specPath)) {
    const doc = yaml.load(readFileSync(specPath, 'utf8')) as any;
    doc.servers = [{ url: '/api', description: 'Server ini' }];
    SwaggerModule.setup('docs', app, doc);
  }

  const port = config.port();
  await app.listen(port);
  new Logger('Bootstrap').log(`API siap di http://localhost:${port}/api (docs: /docs, agent: ${config.agentMode()})`);
}
bootstrap();
