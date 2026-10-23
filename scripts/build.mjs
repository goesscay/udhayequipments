// Production build without nested package-manager calls, so it works the same locally and on
// hosts where the outer `pnpm run build` and a nested `pnpm` would be different versions.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const steps = [
  ['packages/shared', 'tsc -p tsconfig.json'],
  ['apps/api', 'prisma generate'],
  ['apps/api', 'nest build'],
  ['apps/web', 'next build'],
];

/** The package's own .bin (isolated installs) or the workspace root's (hoisted installs). */
function binPath(cwd, bin) {
  const local = join(cwd, 'node_modules', '.bin');
  const dir = existsSync(join(local, bin)) ? local : join(root, 'node_modules', '.bin');
  return `"${join(dir, bin)}"`;
}

for (const [dir, command] of steps) {
  const [bin, ...args] = command.split(' ');
  const cwd = join(root, dir);
  console.log(`\n▶ ${dir}: ${command}`);
  execSync([binPath(cwd, bin), ...args].join(' '), { cwd, stdio: 'inherit' });
}
