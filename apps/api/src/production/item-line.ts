/**
 * Parses one pasted BOQ line into a job card. A quantity is only read when it is explicitly
 * marked, because a bare leading number is often part of the name ("2 Burner range"):
 *   "3 x Sink unit", "3x Sink unit", "3 nos Sink unit"  → 3 × Sink unit
 *   "Sink unit x 3", "Sink unit - 3 nos"                → 3 × Sink unit
 *   "2 Burner range"                                    → 1 × 2 Burner range
 */
export function parseItemLine(line: string): { name: string; quantity: number } | null {
  const text = line.trim().replace(/^[-*•]\s*/, '').replace(/\s+/g, ' ');
  if (!text) return null;

  const patterns: [RegExp, number, number][] = [
    [/^(\d{1,4})\s*(?:x|×|nos?\.?|pcs?\.?)\s+(.{2,})$/i, 1, 2],
    [/^(.{2,}?)\s*(?:x|×)\s*(\d{1,4})$/i, 2, 1],
    [/^(.{2,}?)\s*[-–]\s*(\d{1,4})\s*(?:nos?\.?|pcs?\.?)?$/i, 2, 1],
  ];
  for (const [re, qtyAt, nameAt] of patterns) {
    const m = text.match(re);
    if (m) return { quantity: Math.max(1, Number(m[qtyAt])), name: m[nameAt].trim().slice(0, 160) };
  }
  return { quantity: 1, name: text.slice(0, 160) };
}
