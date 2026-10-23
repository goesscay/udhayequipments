import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDuration, slaLevelFor } from './sla-levels';

const cfg = { dueSoonHours: 4, escalateAfterHours: 24 };
const now = new Date('2026-10-23T10:00:00Z');
const at = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * 3_600_000);

describe('slaLevelFor', () => {
  it('is 0 while comfortably before the due-soon window', () => {
    assert.equal(slaLevelFor(at(10), now, cfg), 0);
    assert.equal(slaLevelFor(at(4.01), now, cfg), 0);
  });

  it('is 1 (due soon) inside the window but not yet late', () => {
    assert.equal(slaLevelFor(at(4), now, cfg), 1);
    assert.equal(slaLevelFor(at(0.1), now, cfg), 1);
  });

  it('is 2 (overdue) from the due time until the escalation threshold', () => {
    assert.equal(slaLevelFor(at(0), now, cfg), 2);
    assert.equal(slaLevelFor(at(-23.9), now, cfg), 2);
  });

  it('is 3 (escalated) once overdue by the escalation threshold', () => {
    assert.equal(slaLevelFor(at(-24), now, cfg), 3);
    assert.equal(slaLevelFor(at(-200), now, cfg), 3);
  });
});

describe('formatDuration', () => {
  it('uses hours under two days and days after', () => {
    assert.equal(formatDuration(30 * 60_000), '1h');
    assert.equal(formatDuration(5 * 3_600_000), '5h');
    assert.equal(formatDuration(47 * 3_600_000), '47h');
    assert.equal(formatDuration(72 * 3_600_000), '3d');
    assert.equal(formatDuration(-5 * 3_600_000), '5h');
  });
});
