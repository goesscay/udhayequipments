import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createWebHandler, runMigrations } from './bootstrap/production';
import { runSeed, seedOptionsFromEnv } from './bootstrap/seed';
import { PrismaService } from './prisma/prisma.module';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  // On the server there is no separate release step, so the app prepares its own database.
  if (isProd && process.env.DB_AUTO_MIGRATE !== 'false') runMigrations();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  if (isProd && process.env.DB_AUTO_SEED !== 'false') {
    await runSeed(app.get(PrismaService), {
      ...seedOptionsFromEnv(process.env),
      demoUsers: undefined,
      log: (m) => Logger.log(m, 'Seed'),
    });
  }

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

  // Single-process mode: serve the built web app for every non-/api path.
  if (process.env.SERVE_WEB !== 'false') {
    const web = await createWebHandler();
    if (web) app.use(web);
  }

  const port = Number(process.env.PORT ?? config.get('PORT', 4000));
  await app.listen(port);
  Logger.log(`Listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
