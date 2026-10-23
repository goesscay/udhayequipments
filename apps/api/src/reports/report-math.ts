/** Pure helpers for reports and CSV export (unit-tested in report-math.spec.ts). */

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

const monthFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });

/** "2026-10", in India time so month boundaries match what the team sees. */
export function monthKey(d: Date): string {
  return monthFmt.format(d).slice(0, 7);
}

/** Every month key from `from` to `to` inclusive, capped at 36 months. */
export function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const [fy, fm] = monthKey(from).split('-').map(Number);
  const [ty, tm] = monthKey(to).split('-').map(Number);
  let y = fy;
  let m = fm;
  while ((y < ty || (y === ty && m <= tm)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * RFC 4180 CSV with a UTF-8 BOM so Excel shows ₹ and names correctly. Cells that a spreadsheet
 * would treat as a formula (=, +, -, @) are prefixed with an apostrophe.
 */
export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    if (v == null) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((r) => r.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function parseRange(from?: string, to?: string, now = new Date()) {
  const end = to ? new Date(to) : now;
  const start = from ? new Date(from) : new Date(end.getTime() - 90 * 86_400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null;
  }
  // Treat a date-only "to" as the whole day.
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}
