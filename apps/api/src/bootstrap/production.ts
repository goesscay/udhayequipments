import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const logger = new Logger('Bootstrap');
const apiRoot = resolve(__dirname, '../..');

/**
 * Hostinger writes DATABASE_URL with host "localhost", which can resolve to IPv6 (::1) where the
 * database user has no grant. Point it at 127.0.0.1 before Prisma reads it.
 */
export function normalizeDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      process.env.DATABASE_URL = url.toString();
    }
  } catch {
    // Leave an unparsable value alone; Prisma reports it clearly.
  }
}

/**
 * Applies pending Prisma migrations. Runs at start-up because shared hosting has no
 * shell step between build and start. Fails loudly so a broken schema never serves traffic.
 */
export function runMigrations() {
  const cli = createRequire(join(apiRoot, 'package.json')).resolve('prisma/build/index.js');
  logger.log('Applying database migrations…');
  execFileSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', join(apiRoot, 'prisma/schema.prisma')], {
    stdio: 'inherit',
    env: process.env,
  });
}

/**
 * Loads the built Next.js app (apps/web) so one Node process serves both the API and the UI,
 * which is what a single Hostinger Node.js website runs. Returns null when there is no build.
 */
export async function createWebHandler(): Promise<RequestHandler | null> {
  const webDir = process.env.WEB_DIR ? resolve(process.env.WEB_DIR) : resolve(apiRoot, '../web');
  if (!existsSync(join(webDir, '.next', 'BUILD_ID'))) {
    logger.warn(`No Next.js build found in ${webDir}; serving the API only.`);
    return null;
  }
  // Resolve Next from the web app so its own React and dependencies are used.
  const next = createRequire(join(webDir, 'package.json'))('next') as (opts: {
    dev: boolean;
    dir: string;
  }) => { prepare(): Promise<void>; getRequestHandler(): (req: Request, res: Response) => Promise<void> };

  const app = next({ dev: false, dir: webDir });
  await app.prepare();
  const handle = app.getRequestHandler();
  logger.log(`Serving web app from ${webDir}`);

  return (req: Request, res: Response, nextFn: NextFunction) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return nextFn();
    handle(req, res).catch(nextFn);
  };
}
