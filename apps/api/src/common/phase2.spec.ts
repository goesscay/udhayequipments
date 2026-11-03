import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addMonths } from '../installation/dates';
import { parseItemLine } from '../production/item-line';
import { median, monthKey, monthsBetween, parseRange, toCsv } from '../reports/report-math';
import { mapDepartment, normaliseWorkflowConfig, normalizePhone, resolveWorkflow, tidyName, workflowProblems } from '@udhay/shared';
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
    assert.deepEqual(mapDepartment('Accounts '), { team: 'ACCOUNTS', role: 'ACCOUNTS' });
    assert.deepEqual(mapDepartment('Purchase'), { team: 'PURCHASE', role: 'PURCHASE' });
    assert.deepEqual(mapDepartment('Operations'), { team: 'OPERATIONS', role: 'OPERATIONS' });
    assert.deepEqual(mapDepartment('Design Engineer'), { team: 'CAD', role: 'CAD' });
    assert.deepEqual(mapDepartment('Project Co-ordinator'), { team: 'PROJECT', role: 'PROJECT' });
    assert.deepEqual(mapDepartment('Sales Co-ordinator'), { team: 'SALES', role: 'SALES' });
    assert.deepEqual(mapDepartment('Service'), { team: 'SERVICE', role: 'SERVICE' });
    assert.deepEqual(mapDepartment('QC'), { team: 'QC', role: 'QC' });
    assert.deepEqual(mapDepartment('SERVICE & SUPPORT'), { team: 'SERVICE', role: 'SERVICE' });
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

describe('configurable workflow', () => {
  it('matches the built-in workflow when nothing is configured', () => {
    const wf = resolveWorkflow();
    assert.equal(wf.activeStages.length, 15);
    assert.equal(wf.find('SITE_SURVEY', 'SUBMIT')?.to, 'CAD_DRAWING');
    assert.deepEqual(wf.progress('LEAD'), { step: 1, total: 15 });
  });

  it('follows the company process sheet step by step', () => {
    const wf = resolveWorkflow();
    // Stage, responsible team, and who it is handed to (rows 1-15 of UdhayEquipmentProcess.xlsx).
    const sheet: [string, string, string | null][] = [
      ['LEAD', 'SALES', 'CAD'],
      ['LAYOUT_DRAWING', 'CAD', 'SALES'],
      ['LAYOUT_APPROVAL', 'SALES', 'OPERATIONS'],
      ['QUOTATION_PREP', 'OPERATIONS', 'SALES'],
      ['CUSTOMER_DECISION', 'SALES', 'OPERATIONS'],
      ['BOQ_DRAWING', 'OPERATIONS', 'PROJECT'],
      ['SITE_SURVEY', 'PROJECT', 'CAD'],
      ['CAD_DRAWING', 'CAD', 'MANAGEMENT'],
      ['HEAD_APPROVAL', 'MANAGEMENT', 'CAD'],
      ['CAD_RELEASE', 'CAD', 'PRODUCTION'],
      ['PRODUCTION', 'PRODUCTION', 'QC'],
      ['QC', 'QC', 'DISPATCH'],
      ['DISPATCH', 'DISPATCH', 'PROJECT'],
      ['INSTALLATION', 'PROJECT', 'SERVICE'],
      ['SERVICE', 'SERVICE', null],
    ];
    assert.deepEqual(wf.stages.map((s) => s.code), sheet.map(([c]) => c));
    for (const [code, team, next] of sheet) {
      assert.equal(wf.stage(code).team, team, code);
      const forward = wf.from(code).find((t) => t.to && wf.index(t.to) > wf.index(code));
      assert.equal(forward ? wf.stage(forward.to!).team : null, next, code);
    }
    assert.deepEqual(wf.find('CUSTOMER_DECISION', 'ACCEPT')?.requiresDocuments, ['PURCHASE_ORDER']);
    assert.equal(wf.find('QC', 'REJECT')?.to, 'PRODUCTION');
  });

  it('still names stages that were merged away, for old history', () => {
    const wf = resolveWorkflow();
    assert.equal(wf.stage('QUOTATION_SHARED').label, 'Quotation Shared');
    assert.equal(wf.stage('HANDOVER').label, 'Handover');
    assert.equal(wf.index('HANDOVER'), -1);
  });

  it('skips switched-off stages going forward and drops returns into them', () => {
    const wf = resolveWorkflow({ stages: { CAD_DRAWING: { enabled: false }, HEAD_APPROVAL: { enabled: false } }, transitions: {} });
    assert.equal(wf.find('SITE_SURVEY', 'SUBMIT')?.to, 'CAD_RELEASE');
    assert.equal(wf.activeStages.length, 13);
    // A project still in MEP Layout Approval can finish it, but can't be sent back to a stage that is off.
    assert.equal(wf.find('HEAD_APPROVAL', 'APPROVE')?.to, 'CAD_RELEASE');
    assert.equal(wf.find('HEAD_APPROVAL', 'REJECT'), undefined);
    assert.deepEqual(wf.progress('HEAD_APPROVAL'), { step: 8, total: 13 });
  });

  it('applies renames, teams, documents and switched-off side paths', () => {
    const wf = resolveWorkflow({
      stages: { SITE_SURVEY: { label: 'Site visit', team: 'SALES' } },
      transitions: {
        'SITE_SURVEY.SUBMIT': { label: 'Send to quotes', requiresDocuments: ['MEASUREMENT', 'SITE_PHOTO'] },
        'LEAD.MARK_LOST': { enabled: false },
      },
    });
    assert.equal(wf.stage('SITE_SURVEY').label, 'Site visit');
    assert.equal(wf.stage('SITE_SURVEY').team, 'SALES');
    assert.deepEqual(wf.find('SITE_SURVEY', 'SUBMIT')?.requiresDocuments, ['MEASUREMENT', 'SITE_PHOTO']);
    assert.equal(wf.find('LEAD', 'MARK_LOST'), undefined);
    assert.equal(wf.from('LEAD').length, 1);
  });

  it('stores only real changes and refuses ones that would break the workflow', () => {
    const cfg = normaliseWorkflowConfig({
      stages: {
        LEAD: { label: 'Lead & Requirement', enabled: false }, // default label; Lead can't be switched off
        HEAD_APPROVAL: { team: 'CAD' }, // fixed team
        PRODUCTION: { label: '  Fabrication  ', team: 'NOPE' },
        BOGUS: { label: 'x' },
      },
      transitions: {
        'SITE_SURVEY.SUBMIT': { enabled: false, requiresDocuments: ['MEASUREMENT', 'NOT_A_DOC'] }, // main step stays on
        'LEAD.MARK_LOST': { reasonRequired: false, enabled: false },
      },
    });
    assert.deepEqual(cfg, {
      stages: { PRODUCTION: { label: 'Fabrication' } },
      transitions: { 'LEAD.MARK_LOST': { enabled: false } },
    });
  });
});

describe('added stages and order', () => {
  const custom = [{ code: 'X_PAINT1', label: 'Powder coating', short: 'Coating', team: 'PRODUCTION' as const, slaHours: 24 }];

  it('places an added stage where it was put and routes work through it', () => {
    const order = [...resolveWorkflow().stages.map((s) => s.code)];
    order.splice(order.indexOf('PRODUCTION') + 1, 0, 'X_PAINT1');
    const wf = resolveWorkflow({ stages: {}, transitions: {}, custom, order });
    assert.equal(wf.find('PRODUCTION', 'COMPLETE')?.to, 'X_PAINT1');
    assert.equal(wf.find('X_PAINT1', 'SUBMIT')?.to, 'QC');
    assert.equal(wf.find('X_PAINT1', 'SUBMIT')?.label, 'Send to Quality Check (QC)');
    // "Send back" is off until switched on, then goes to the stage before.
    assert.equal(wf.find('X_PAINT1', 'REQUEST_REVISION'), undefined);
    const on = resolveWorkflow({ stages: {}, transitions: { 'X_PAINT1.REQUEST_REVISION': { enabled: true } }, custom, order });
    assert.equal(on.find('X_PAINT1', 'REQUEST_REVISION')?.to, 'PRODUCTION');
    assert.equal(on.stage('X_PAINT1').team, 'PRODUCTION');
  });

  it('moves built-in stages and keeps revision paths only where they still point back', () => {
    const order = resolveWorkflow().stages.map((s) => s.code).filter((c) => c !== 'SITE_SURVEY');
    order.splice(order.indexOf('CUSTOMER_DECISION') + 1, 0, 'SITE_SURVEY');
    const wf = resolveWorkflow({ stages: {}, transitions: {}, order });
    assert.equal(wf.find('CUSTOMER_DECISION', 'ACCEPT')?.to, 'SITE_SURVEY');
    assert.equal(wf.find('SITE_SURVEY', 'SUBMIT')?.to, 'BOQ_DRAWING');
    assert.equal(wf.find('BOQ_DRAWING', 'SUBMIT')?.to, 'CAD_DRAWING');
    // "Revise BOQ" pointed back to the BOQ, which now comes later.
    assert.equal(wf.find('SITE_SURVEY', 'REQUEST_REVISION'), undefined);
    assert.deepEqual(workflowProblems({ stages: {}, transitions: {}, order }), []);
  });

  it('reports orders that break the built-in dependencies', () => {
    const order = resolveWorkflow().stages.map((s) => s.code);
    [order[order.indexOf('DISPATCH')], order[order.indexOf('QC')]] = ['QC', 'DISPATCH'];
    assert.deepEqual(workflowProblems({ stages: {}, transitions: {}, order }), ['Quality Check (QC) has to come before Dispatch & Delivery.']);
    const moved = order.filter((c) => c !== 'LEAD').concat('LEAD');
    assert.ok(workflowProblems({ stages: {}, transitions: {}, order: moved }).some((p) => p.includes('first')));
  });

  it('keeps unknown codes out and refills missing built-in stages', () => {
    const cfg = normaliseWorkflowConfig({
      stages: {},
      transitions: {},
      custom: [...custom, { code: 'bad code', label: 'x' }],
      order: ['LEAD', 'X_PAINT1', 'NOPE'],
    });
    assert.deepEqual(cfg.custom?.map((c) => c.code), ['X_PAINT1']);
    const codes = resolveWorkflow(cfg).stages.map((s) => s.code);
    assert.equal(codes.length, 16);
    // Missing built-in stages go back after the stage before them, keeping added stages where they were.
    assert.deepEqual(codes.slice(0, 3), ['LEAD', 'X_PAINT1', 'LAYOUT_DRAWING']);
    assert.equal(codes.at(-1), 'SERVICE');
  });
});
