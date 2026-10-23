/** Calendar months, clamped to the end of shorter months (warranty end dates). */
export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 31 Jan + 1 month → 28/29 Feb, not 2/3 Mar.
  if (d.getDate() < day) d.setDate(0);
  return d;
}
