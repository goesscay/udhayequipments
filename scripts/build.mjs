// Production build without nested package-manager calls, so it works the same locally and on
// hosts where the outer `pnpm run build` and a nested `pnpm` would be different versions.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const steps = [
  ['packages/shared', 'tsc -p tsconfig.json'],
  ['apps/api', 'prisma generate'],
  ['apps/api', 'nest build'],
  ['apps/web', 'next build'],
];

for (const [dir, command] of steps) {
  const [bin, ...args] = command.split(' ');
  const cwd = join(root, dir);
  console.log(`\n▶ ${dir}: ${command}`);
  execSync([join('node_modules', '.bin', bin), ...args].join(' '), { cwd, stdio: 'inherit' });
}
