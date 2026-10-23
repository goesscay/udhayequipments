// Generates the PWA / home-screen icons in apps/web/public/icons from a simple brand mark.
// Run: node scripts/generate-icons.mjs   (uses the sharp copy that Next.js installs)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps/web');
// sharp is an optional dependency of Next.js, so resolve it from Next's own folder.
const nextPkg = createRequire(join(web, 'package.json')).resolve('next/package.json');
const sharp = createRequire(nextPkg)('sharp');
const out = join(web, 'public/icons');
mkdirSync(out, { recursive: true });

const GOLD = '#B8862B';

/** A gold "U" on white. `scale` < 1 keeps the mark inside the maskable safe zone. */
const mark = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#FFFFFF"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <path d="M168 132 V282 a88 88 0 0 0 176 0 V132" fill="none" stroke="${GOLD}" stroke-width="60" stroke-linecap="round"/>
    <rect x="196" y="420" width="120" height="10" rx="5" fill="${GOLD}" opacity="0.55"/>
  </g>
</svg>`;

const icons = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['maskable-512.png', 512, 0.72],
  ['apple-touch-icon.png', 180, 0.86],
  ['favicon-32.png', 32, 1],
];

for (const [name, size, scale] of icons) {
  await sharp(Buffer.from(mark(scale))).resize(size, size).png().toFile(join(out, name));
  console.log(`icons/${name}`);
}
