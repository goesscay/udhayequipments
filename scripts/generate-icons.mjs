// Generates the browser-tab and app icons from the logo's "U" mark (the U with the horse).
// Run: node scripts/generate-icons.mjs   (uses the sharp copy that Next.js installs)
import { mkdirSync, writeFileSync } from 'node:fs';
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

const LOGO = join(web, 'public/logo.png');
// The U + horse sit at the left of the wordmark, above the tagline and before the "D".
const SEARCH = { maxX: 74, maxY: 57 };

/** Bounding box of non-white pixels inside the search area of the logo. */
async function markBox() {
  const { data, info } = await sharp(LOGO).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < Math.min(SEARCH.maxY, info.height); y++) {
    for (let x = 0; x < Math.min(SEARCH.maxX, info.width); x++) {
      const i = (y * info.width + x) * 3;
      if (data[i] + data[i + 1] + data[i + 2] < 690) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) throw new Error('U mark not found in logo');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const box = await markBox();
console.log(`U mark found at x=${box.left} y=${box.top} (${box.width}×${box.height}px)`);
const mark = await sharp(LOGO).extract(box).png().toBuffer();

/** The mark centred on white, filling `fill` of the square (smaller for maskable safe zones). */
async function icon(size, fill) {
  const inner = Math.round(size * fill);
  const scaled = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: '#ffffff', kernel: 'lanczos3' })
    // A light sharpen offsets the softness of enlarging a small source.
    .sharpen(size >= 128 ? { sigma: 0.8 } : undefined)
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png()
    .toBuffer();
}

const files = [
  ['favicon-16.png', 16, 0.94],
  ['favicon-32.png', 32, 0.92],
  ['favicon-48.png', 48, 0.9],
  ['icon-192.png', 192, 0.82],
  ['icon-512.png', 512, 0.82],
  ['maskable-512.png', 512, 0.6],
  ['apple-touch-icon.png', 180, 0.78],
];
const pngs = {};
for (const [name, size, fill] of files) {
  pngs[name] = await icon(size, fill);
  writeFileSync(join(out, name), pngs[name]);
  console.log(`icons/${name}`);
}

/** favicon.ico holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const e = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, e);
    dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
    dir.writeUInt8(0, e + 2);
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(data.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.data)]);
}
writeFileSync(
  join(web, 'src/app/favicon.ico'),
  ico([
    { size: 16, data: pngs['favicon-16.png'] },
    { size: 32, data: pngs['favicon-32.png'] },
    { size: 48, data: pngs['favicon-48.png'] },
  ]),
);
console.log('src/app/favicon.ico');
