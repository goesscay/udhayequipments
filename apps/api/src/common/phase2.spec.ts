import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addMonths } from '../installation/dates';
import { parseItemLine } from '../production/item-line';
import { median, monthKey, monthsBetween, parseRange, toCsv } from '../reports/report-math';
import { mapDepartment, normalizePhone, tidyName } from '@udhay/shared';
import { extractMentions, plainMentions } from './mentions';
import { temporaryPassword } from './passwords';

describe('parseItemLine', () => {
  it('reads explicitly marked quantities', () => {
    assert.deepEqual(parseItemLine('3 x Sink unit'), { quantity: 3, name: 'Sink unit' });
    assert.deepEqual(parseItemLine('3x Sink unit'), { quantity: 3, name: 'Sink unit' });
    assert.deepEqual(parseItemLine('4 nos Work table'), { quantity: 4, name: 'Work table' });
    assert.deepEqual(parseItemLine('Exhaust hood x 2'), { quantity: 2, name: 'Exhaust hood' });
    assert.deepEqual(parseItemLine('Exhaust hood - 2 nos'), { quantity: 2, name: 'Exhaust hood' });
  });

  it('keeps a bare leading number as part of the name', () => {
    assert.deepEqual(parseItemLine('2 Burner range'), { quantity: 1, name: '2 Burner range' });
  });

  it('strips bullets and ignores blank lines', () => {
    assert.deepEqual(parseItemLine('• Tandoor'), { quantity: 1, name: 'Tandoor' });
    assert.equal(parseItemLine('   '), null);
  });
});

describe('addMonths', () => {
  it('adds calendar months', () => {
    assert.equal(addMonths(new Date(2026, 9, 23), 12).toDateString(), new Date(2027, 9, 23).toDateString());
  });
  it('clamps to the end of a shorter month', () => {
    assert.equal(addMonths(new Date(2026, 0, 31), 1).toDateString(), new Date(2026, 1, 28).toDateString());
  });
});

describe('report maths', () => {
  it('median of odd and even lists', () => {
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
  });

  it('month keys use India time', () => {
    // 31 Oct 2026 20:00 UTC is already 1 Nov in India.
    assert.equal(monthKey(new Date('2026-10-31T20:00:00Z')), '2026-11');
  });

  it('lists months across a year boundary', () => {
    assert.deepEqual(monthsBetween(new Date('2026-11-15T06:00:00Z'), new Date('2027-02-01T06:00:00Z')), [
      '2026-11', '2026-12', '2027-01', '2027-02',
    ]);
  });

  it('rejects an inverted range and defaults to 90 days', () => {
    assert.equal(parseRange('2026-10-10', '2026-10-01'), null);
    const r = parseRange(undefined, undefined, new Date('2026-10-23T00:00:00Z'))!;
    assert.equal(Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000), 90);
  });
});

describe('toCsv', () => {
  it('quotes, escapes and neutralises formulas', () => {
    const csv = toCsv(['A', 'B'], [['x,y', 'say "hi"'], ['=SUM(A1)', 5], [null, -3]]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    assert.equal(lines[1], '"x,y","say ""hi"""');
    assert.equal(lines[2], "'=SUM(A1),5");
    // Negative numbers stay numbers; only strings are neutralised.
    assert.equal(lines[3], ',-3');
    assert.ok(csv.startsWith('﻿'));
  });
});

describe('mentions', () => {
  const body = 'Please check @[Ravi Kumar](ckz1abcdefghijklmnopqrst) and @[Ravi Kumar](ckz1abcdefghijklmnopqrst)';
  it('extracts unique user ids', () => {
    assert.deepEqual(extractMentions(body), ['ckz1abcdefghijklmnopqrst']);
  });
  it('renders plain text', () => {
    assert.equal(plainMentions(body), 'Please check @Ravi Kumar and @Ravi Kumar');
  });
});

describe('people helpers', () => {
  it('normalises Indian mobile numbers from the HR sheet', () => {
    assert.equal(normalizePhone('917708796590'), '+917708796590');
    assert.equal(normalizePhone(917708796590), '+917708796590');
    assert.equal(normalizePhone('77087 96590'), '+917708796590');
    assert.equal(normalizePhone('07708796590'), '+917708796590');
    assert.equal(normalizePhone('12'), null);
  });

  it('tidies uppercase names with initials', () => {
    assert.equal(tidyName('G.SASIREKHA '), 'G. Sasirekha');
    assert.equal(tidyName('M.SATHYA SEELAN'), 'M. Sathya Seelan');
    assert.equal(tidyName('V.NAVEEN KUMAR'), 'V. Naveen Kumar');
  });

  it('maps every department in the staff sheet to a team and role', () => {
    assert.deepEqual(mapDepartment('Accounts '), { team: null, role: 'ACCOUNTS' });
    assert.deepEqual(mapDepartment('Purchase'), { team: null, role: 'PURCHASE' });
    assert.deepEqual(mapDepartment('Operations'), { team: 'OPERATIONS', role: 'OPERATIONS' });
    assert.deepEqual(mapDepartment('Design Engineer'), { team: 'CAD', role: 'TEAM_MEMBER' });
    assert.deepEqual(mapDepartment('Project Co-ordinator'), { team: 'PROJECT', role: 'TEAM_MEMBER' });
    assert.deepEqual(mapDepartment('Sales Co-ordinator'), { team: 'SALES', role: 'TEAM_MEMBER' });
    assert.deepEqual(mapDepartment('Service'), { team: 'SERVICE', role: 'TEAM_MEMBER' });
    assert.equal(mapDepartment('Canteen'), null);
  });

  it('generates readable temporary passwords that meet the password rule', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pw = temporaryPassword();
      assert.match(pw, /^Udh-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      assert.match(pw, /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/);
      seen.add(pw);
    }
    assert.equal(seen.size, 200);
  });
});
