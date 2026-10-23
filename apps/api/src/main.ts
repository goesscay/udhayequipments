import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { WarmupGate, createWebHandler, normalizeDatabaseUrl, runMigrations } from './bootstrap/production';
import { runSeed, seedOptionsFromEnv } from './bootstrap/seed';
import { JobRunner } from './jobs/jobs.module';
import { PrismaService } from './prisma/prisma.module';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  normalizeDatabaseUrl();

  // Prisma connects lazily, so creating the app does not touch the database.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const gate = new WarmupGate();
  let web: RequestHandler | null = null;

  app.use(gate.middleware);
  app.setGlobalPrefix('api');
  app.set('trust proxy', 1);
  // Strict headers for the API; the Next.js pages set their own.
  app.use('/api', helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN', 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  if (!isProd) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('UDHAY Project Tracker API')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }

  // Single-process mode: every non-/api path goes to the built Next.js app once it is loaded.
  app.use(((req, res, next) => (web ? web(req, res, next) : next())) as RequestHandler);

  const port = Number(process.env.PORT ?? config.get('PORT', 4000));
  await app.listen(port);
  Logger.log(`Listening on port ${port}, warming up…`, 'Bootstrap');

  try {
    // On the server there is no separate release step, so the app prepares its own database.
    if (isProd && process.env.DB_AUTO_MIGRATE !== 'false') await runMigrations();
    if (isProd && process.env.DB_AUTO_SEED !== 'false') {
      await runSeed(app.get(PrismaService), {
        ...seedOptionsFromEnv(process.env),
        demoUsers: undefined,
        log: (m) => Logger.log(m, 'Seed'),
      });
    }
    if (process.env.SERVE_WEB !== 'false') web = await createWebHandler();
    app.get(JobRunner).start();
    gate.open();
    Logger.log('Ready', 'Bootstrap');
  } catch (e) {
    // Exit so the host restarts us rather than serving with a half-migrated database.
    Logger.error(`Start-up failed: ${(e as Error).message}`, (e as Error).stack, 'Bootstrap');
    await app.close().catch(() => undefined);
    process.exit(1);
  }
}

void bootstrap();
