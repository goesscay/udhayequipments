import { randomInt } from 'node:crypto';

/** "Udh-K7QM-4XPA": easy to read aloud, no 0/O or 1/I/L. */
export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (;;) {
    const part = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const pw = `Udh-${part()}-${part()}`;
    if (/\d/.test(pw)) return pw;
  }
}
