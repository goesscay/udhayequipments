import type { Db } from './types';

/**
 * Next number in a yearly sequence, e.g. nextCode(tx, 'UDH', 'project') → "UDH-2026-0042".
 * `counter` names the row in the Counter table ("project-2026"); keep existing names stable or
 * numbering restarts and collides with codes already issued.
 * Call inside a transaction: the upsert row-locks the counter until commit.
 */
export async function nextCode(tx: Db, prefix: string, counter: string, now = new Date()) {
  const year = now.getFullYear();
  const key = `${counter}-${year}`;
  await tx.$executeRaw`INSERT INTO Counter (\`key\`, value) VALUES (${key}, 1) ON DUPLICATE KEY UPDATE value = value + 1`;
  const row = await tx.counter.findUniqueOrThrow({ where: { key } });
  return `${prefix}-${year}-${String(row.value).padStart(4, '0')}`;
}
