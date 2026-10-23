import { PrismaClient } from '@prisma/client';
import { runSeed, seedOptionsFromEnv } from '../src/bootstrap/seed';

const prisma = new PrismaClient();
const opts = seedOptionsFromEnv(process.env);
if (!opts.superAdmin) {
  console.warn('SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD not set: no Super Admin will be created.');
}

runSeed(prisma, opts)
  .then(() => console.log('Seed complete.'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
