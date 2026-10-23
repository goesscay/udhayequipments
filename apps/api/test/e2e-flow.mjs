#!/usr/bin/env node
/**
 * End-to-end workflow check against a running API and a THROWAWAY database.
 *
 *   node test/e2e-flow.mjs phase1   # against the previous release: creates users + a project at Head Approval
 *   node test/e2e-flow.mjs phase2   # against the new release on the same DB: upgrade checks + Phase 2 flow
 *
 * Env: BASE_URL (e.g. http://localhost:4602), ADMIN_EMAIL, ADMIN_PASSWORD, STATE_FILE.
 * It creates users and projects, so it refuses to run against the production domain.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4601';
if (/udhayequipments\.com/.test(BASE)) throw new Error('Refusing to run against production');
const STATE_FILE = process.env.STATE_FILE ?? './e2e-state.json';
const PASSWORD = 'E2e-test-pass-2026';
const phase = process.argv[2];

let passed = 0;
const ok = (msg) => {
  passed++;
  console.log(`  ✔ ${msg}`);
};

async function call(token, method, path, body, { expect = [200, 201, 204], form } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!expect.includes(res.status)) {
    throw new Error(`${method} ${path} → ${res.status} ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data)}`);
  }
  return { status: res.status, data };
}

/** Login is rate-limited (10/min per IP) on purpose, so wait and retry instead of failing. */
async function login(email, password) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await call(null, 'POST', '/auth/login', { email, password }, { expect: [200, 429] });
    if (r.status === 200) return r.data.accessToken;
    await new Promise((res) => setTimeout(res, 15_000));
  }
  throw new Error(`login for ${email} kept hitting the rate limit`);
}

const as = (token) => ({
  get: (p, o) => call(token, 'GET', p, undefined, o).then((r) => r.data),
  post: (p, b, o) => call(token, 'POST', p, b ?? {}, o).then((r) => r.data),
  patch: (p, b, o) => call(token, 'PATCH', p, b, o).then((r) => r.data),
  put: (p, b, o) => call(token, 'PUT', p, b, o).then((r) => r.data),
  status: (method, p, b) => call(token, method, p, b, { expect: [200, 201, 204, 400, 401, 403, 404, 409] }),
  raw: async (p) => {
    const res = await fetch(`${BASE}/api${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${p} -> ${res.status}`);
    return res.arrayBuffer();
  },
  upload: async (projectId, type, name = `${type.toLowerCase()}.pdf`) => {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('file', new Blob([`%PDF-1.4 e2e ${type}`], { type: 'application/pdf' }), name);
    return (await call(token, 'POST', `/projects/${projectId}/documents`, undefined, { form: fd })).data;
  },
});

const detail = (u, id) => u.get(`/projects/${id}`);

/** Accept the handoff if possible, then perform the action. */
async function step(u, id, action, reason) {
  const p = await detail(u, id);
  if (p.canAccept) await u.post(`/projects/${id}/accept`);
  return u.post(`/projects/${id}/transitions`, { action, reason });
}

async function expectBlocked(u, id, action, pattern) {
  const p = await detail(u, id);
  if (p.canAccept) await u.post(`/projects/${id}/accept`);
  const fresh = await detail(u, id);
  const a = fresh.availableActions.find((x) => x.action === action);
  assert.ok(a, `action ${action} should be listed`);
  assert.ok(a.blockers.some((b) => pattern.test(b)), `expected blocker ${pattern} in ${JSON.stringify(a.blockers)}`);
  const r = await u.status('POST', `/projects/${id}/transitions`, { action });
  assert.equal(r.status, 400, `transition should be refused, got ${r.status}`);
  assert.match(JSON.stringify(r.data), pattern);
}

// ─────────────────────────────────────────────────────────────────────────────

async function phase1() {
  console.log('Phase 1 (previous release): users and a project up to Head Approval');
  const admin = as(await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD));
  const roles = await admin.get('/roles');
  const teams = await admin.get('/teams');
  const roleId = (code) => roles.find((r) => r.code === code).id;
  const teamId = (code) => teams.find((t) => t.code === code).id;

  const people = {
    office: ['ADMIN', 'ADMIN'],
    head: ['DIRECTOR', 'MANAGEMENT'],
    sales: ['TEAM_HEAD', 'SALES'],
    project: ['TEAM_HEAD', 'PROJECT'],
    cad: ['TEAM_HEAD', 'CAD'],
    production: ['TEAM_HEAD', 'PRODUCTION'],
    dispatch: ['TEAM_HEAD', 'DISPATCH'],
    service: ['TEAM_HEAD', 'SERVICE'],
    tech: ['TEAM_MEMBER', 'SERVICE'],
    salesMember: ['TEAM_MEMBER', 'SALES'],
  };
  const users = {};
  const existing = await admin.get('/users');
  for (const [key, [role, team]] of Object.entries(people)) {
    const email = `${key.toLowerCase()}@e2e.test`;
    const found = existing.find((u) => u.email === email);
    const u = found ?? (await admin.post('/users', { name: `E2E ${key}`, email, password: PASSWORD, roleId: roleId(role), teamId: teamId(team) }));
    users[key] = { id: u.id, email };
  }
  ok(`created ${Object.keys(users).length} users across all teams`);

  const t = {};
  for (const [k, v] of Object.entries(users)) t[k] = as(await login(v.email, PASSWORD));

  const p1 = await t.sales.post('/projects', {
    title: 'E2E main kitchen',
    customerName: 'E2E Hotel',
    customerPhone: '9800000001',
    city: 'Chennai',
    priority: 'HIGH',
    estimatedValue: 1000000,
  });
  const p2 = await t.sales.post('/projects', { title: 'E2E café', customerName: 'E2E Café', customerPhone: '9800000002', priority: 'NORMAL' });
  ok(`created projects ${p1.code} and ${p2.code}`);

  await step(t.sales, p1.id, 'SUBMIT');
  await t.project.post(`/projects/${p1.id}/accept`);
  await t.project.upload(p1.id, 'MEASUREMENT');
  await step(t.project, p1.id, 'SUBMIT');
  await t.office.upload(p1.id, 'QUOTATION');
  await step(t.office, p1.id, 'SUBMIT');
  await step(t.sales, p1.id, 'MARK_SENT');
  await step(t.sales, p1.id, 'ACCEPT');
  await t.office.upload(p1.id, 'BOQ');
  await t.office.upload(p1.id, 'SOFT_DRAWING');
  await step(t.office, p1.id, 'SUBMIT');
  await step(t.project, p1.id, 'APPROVE');
  await t.cad.post(`/projects/${p1.id}/accept`);
  await t.cad.upload(p1.id, 'CAD');
  await step(t.cad, p1.id, 'SUBMIT');
  const at = await detail(t.head, p1.id);
  assert.equal(at.currentStage, 'HEAD_APPROVAL');
  ok('project walked Lead → Head Approval with real handoffs and uploads');

  await t.sales.post(`/projects/${p1.id}/comments`, { body: 'Phase 1 comment' });
  writeFileSync(STATE_FILE, JSON.stringify({ users, p1: p1.id, p1Code: p1.code, p2: p2.id, p2Code: p2.code }, null, 2));
  console.log(`\nPhase 1 OK: ${passed} checks`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function phase2() {
  assert.ok(existsSync(STATE_FILE), 'run phase1 first');
  const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  console.log('Phase 2 (new release on the upgraded DB)');
  const admin = as(await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD));
  const t = {};
  for (const [k, v] of Object.entries(s.users)) t[k] = as(await login(v.email, PASSWORD));

  // Upgrade: old data intact, new permissions granted to existing system roles.
  const p1 = await detail(t.head, s.p1);
  assert.equal(p1.currentStage, 'HEAD_APPROVAL');
  assert.ok(p1.comments.some((c) => c.body === 'Phase 1 comment'));
  assert.equal(p1.documents.length, 5);
  ok('existing project, comment and 5 documents survived the upgrade');
  const roles = await admin.get('/roles');
  const perms = (code) => Object.fromEntries(roles.find((r) => r.code === code).permissions.map((p) => [p.key, p.scope]));
  assert.equal(perms('TEAM_HEAD')['production.manage'], 'TEAM');
  assert.equal(perms('TEAM_MEMBER')['service.manage'], 'TEAM');
  assert.equal(perms('ADMIN')['payment.manage'], 'ALL');
  assert.equal(perms('DIRECTOR')['report.view'], 'ALL');
  assert.equal(perms('VIEWER')['service.view'], 'ALL');
  ok('new permissions were granted to the existing system roles');

  const fresh = await t.sales.post('/projects', { title: 'E2E numbering', customerName: 'E2E Numbering', customerPhone: '9800000003', priority: 'LOW' });
  const n = (code) => Number(code.split('-')[2]);
  assert.equal(n(fresh.code), Math.max(n(s.p1Code), n(s.p2Code)) + 1);
  ok(`project numbering continues after the upgrade (${fresh.code})`);

  // Rules
  const rules = await admin.put('/settings/rules', { advanceBeforeProduction: true, preDispatchBeforeDispatch: true });
  assert.equal(rules.advanceBeforeProduction, true);
  ok('payment gates switched on');

  await expectBlocked(t.head, s.p1, 'APPROVE', /Advance payment not received/);
  ok('Head Approval blocked until the advance is received');

  // Payments
  for (const [kind, label, amount] of [['ADVANCE', 'Advance', 500000], ['PRE_DISPATCH', 'Before dispatch', 400000], ['FINAL', 'Final', 100000]]) {
    await t.office.post(`/projects/${s.p1}/payments`, { kind, label, amount });
  }
  let pay = await t.office.get(`/projects/${s.p1}/payments`);
  assert.equal(pay.totalPlanned, 1000000);
  const advance = pay.milestones.find((m) => m.kind === 'ADVANCE');
  await t.office.post(`/payments/${advance.id}/receive`, { receivedAmount: 500000, mode: 'Bank transfer', reference: 'UTR123' });
  pay = await t.office.get(`/projects/${s.p1}/payments`);
  assert.equal(pay.totalReceived, 500000);
  assert.equal(pay.outstanding, 500000);
  ok('milestones added, advance recorded, totals correct');
  assert.equal((await t.production.status('POST', `/projects/${s.p1}/payments`, { kind: 'OTHER', label: 'x', amount: 1 })).status, 403);
  ok('production team cannot record payments (403)');

  await step(t.head, s.p1, 'APPROVE');
  ok('Head Approval passes once the advance is in');

  // Production
  assert.equal((await t.sales.status('POST', `/projects/${s.p1}/production/items`, { name: 'Sink' })).status, 403);
  ok('sales cannot add production items (403)');
  await t.production.post(`/projects/${s.p1}/accept`);
  await expectBlocked(t.production, s.p1, 'COMPLETE', /Add the production items/);
  const bulk = await t.production.post(`/projects/${s.p1}/production/items/bulk`, { lines: ['Three-burner range', '2 x Work table', '2 Burner range'] });
  assert.equal(bulk.created, 3);
  let prod = await t.production.get(`/projects/${s.p1}/production`);
  assert.deepEqual(prod.items.map((i) => [i.name, i.quantity]), [['Three-burner range', 1], ['Work table', 2], ['2 Burner range', 1]]);
  ok('pasted list parsed quantities correctly ("2 Burner range" stays one item)');
  await expectBlocked(t.production, s.p1, 'COMPLETE', /not finished/);
  for (const i of prod.items) await t.production.patch(`/production/items/${i.id}`, { status: 'DONE' });
  const failR = await t.production.status('POST', `/production/items/${prod.items[0].id}/qc`, { result: 'FAILED' });
  assert.equal(failR.status, 400, 'QC fail needs a note');
  await t.production.post(`/production/items/${prod.items[0].id}/qc`, { result: 'FAILED', notes: 'Burner flame uneven' });
  prod = await t.production.get(`/projects/${s.p1}/production`);
  assert.equal(prod.items[0].status, 'IN_PROGRESS');
  ok('failed QC sends the item back to work');
  await expectBlocked(t.production, s.p1, 'COMPLETE', /quality check|not finished/);
  await t.production.patch(`/production/items/${prod.items[0].id}`, { progress: 100 });
  for (const i of prod.items) await t.production.post(`/production/items/${i.id}/qc`, { result: 'PASSED' });
  prod = await t.production.get(`/projects/${s.p1}/production`);
  assert.equal(prod.readyForDispatch, true);
  assert.equal(prod.progress, 100);
  await step(t.production, s.p1, 'COMPLETE');
  ok('production complete once every item is done and QC-passed');

  // Accepted-handoff notification to whoever handed over (the Overall Head approved into Production).
  const headNotes = await t.head.get('/notifications');
  assert.ok(headNotes.items.some((x) => x.type === 'HANDOFF_ACCEPTED'));
  ok('Overall Head was notified that Production accepted the handoff');
  const salesNotes = await t.sales.get('/notifications');
  assert.ok(salesNotes.items.some((x) => x.type === 'PAYMENT_RECEIVED'));
  ok('sales owner was notified of the payment');

  // Dispatch
  await t.dispatch.post(`/projects/${s.p1}/accept`);
  const trip = await t.dispatch.post(`/projects/${s.p1}/dispatch/trips`, {
    plannedDate: new Date().toISOString(), vehicleNo: 'tn01ab1234', driverName: 'Ravi', driverPhone: '9800000009',
  });
  assert.equal(trip.vehicleNo, 'TN01AB1234');
  const board = await t.dispatch.get('/dispatch/board');
  assert.ok(board.some((b) => b.id === trip.id));
  ok('trip planned and visible on the dispatch board');
  const blockedDispatch = await t.dispatch.status('POST', `/dispatch/trips/${trip.id}/dispatch`);
  assert.equal(blockedDispatch.status, 400);
  assert.match(JSON.stringify(blockedDispatch.data), /Before-dispatch payment/);
  ok('dispatch blocked until the before-dispatch payment');
  const pre = pay.milestones.find((m) => m.kind === 'PRE_DISPATCH');
  await t.office.post(`/payments/${pre.id}/receive`, { receivedAmount: 400000, mode: 'UPI' });
  await t.dispatch.post(`/dispatch/trips/${trip.id}/dispatch`);
  await expectBlocked(t.dispatch, s.p1, 'DELIVER', /not delivered/);
  const noProof = await t.dispatch.status('POST', `/dispatch/trips/${trip.id}/deliver`, { receivedByName: 'Chef Kumar', podDocumentId: 'nope' });
  assert.equal(noProof.status, 400);
  const pod = await t.dispatch.upload(s.p1, 'POD', 'signature.png');
  await t.dispatch.post(`/dispatch/trips/${trip.id}/deliver`, { receivedByName: 'Chef Kumar', podDocumentId: pod.id });
  await step(t.dispatch, s.p1, 'DELIVER');
  ok('delivered with proof; project moved to Installation');

  // Installation & handover
  await t.project.post(`/projects/${s.p1}/accept`);
  const snag = await t.project.post(`/projects/${s.p1}/snags`, { title: 'Hood duct joint leaking' });
  await expectBlocked(t.project, s.p1, 'COMPLETE', /open snag/);
  await t.project.post(`/snags/${snag.id}/resolve`, { resolution: 'Resealed joint' });
  await step(t.project, s.p1, 'COMPLETE');
  ok('installation complete only after the snag was fixed');
  await expectBlocked(t.project, s.p1, 'HANDOVER', /Record the handover/);
  const cert = await t.project.upload(s.p1, 'HANDOVER_CERT', 'handover-signature.png');
  const ho = await t.project.post(`/projects/${s.p1}/handover`, {
    signedByName: 'Mr. Owner', warrantyMonths: 12, trainingDone: true, certificateDocumentId: cert.id,
  });
  const months = (new Date(ho.warrantyEnd) - new Date(ho.warrantyStart)) / (30.44 * 86_400_000);
  assert.ok(months > 11.5 && months < 12.5);
  assert.equal((await t.project.status('POST', `/projects/${s.p1}/handover`, { signedByName: 'Second Try', warrantyMonths: 1, certificateDocumentId: cert.id })).status, 409);
  await step(t.project, s.p1, 'HANDOVER');
  ok('handover recorded with 12-month warranty; project in Service');

  // Service tickets
  // Admin (All scope) sees every project, so this checks the stage rule rather than visibility.
  const early = await t.office.status('POST', '/service/tickets', { projectId: fresh.id, title: 'Too early', description: 'not handed over' });
  assert.match(JSON.stringify(early.data), /after the project is handed over/);
  const hidden = await t.service.status('POST', '/service/tickets', { projectId: fresh.id, title: 'Not mine', description: 'other team' });
  assert.equal(hidden.status, 404, 'Service team cannot see an untouched Sales project');
  assert.equal(early.status, 400);
  const ticket = await t.service.post('/service/tickets', {
    projectId: s.p1, title: 'Burner 2 not igniting', description: 'Customer called', priority: 'URGENT', assigneeId: s.users.tech.id,
  });
  let td = await t.tech.get(`/service/tickets/${ticket.id}`);
  assert.equal(td.underWarranty, true);
  assert.equal(td.status, 'ASSIGNED');
  assert.ok(Math.abs(new Date(td.dueAt) - new Date(td.createdAt) - 4 * 3_600_000) < 60_000, 'URGENT due in 4h');
  const techNotes = await t.tech.get('/notifications');
  assert.ok(techNotes.items.some((x) => x.type === 'TICKET_ASSIGNED'));
  ok('ticket raised under warranty, due in 4h, technician notified');
  await t.tech.post(`/service/tickets/${ticket.id}/visits`, { visitDate: new Date().toISOString(), workDone: 'Replaced igniter', partsUsed: 'Igniter x1' });
  assert.equal((await t.tech.status('POST', `/service/tickets/${ticket.id}/close`, {})).status, 400);
  await t.tech.post(`/service/tickets/${ticket.id}/resolve`, { resolution: 'Igniter replaced' });
  await t.tech.post(`/service/tickets/${ticket.id}/close`, { csatRating: 5, csatComment: 'Quick' });
  td = await t.tech.get(`/service/tickets/${ticket.id}`);
  assert.equal(td.status, 'CLOSED');
  assert.equal(td.visits.length, 1);
  ok('visit logged, resolved, closed with a 5-star rating');
  const queueTickets = await t.tech.get('/service/tickets?status=OPEN_ANY&mine=true');
  assert.equal(queueTickets.length, 0);

  // Mentions
  const cadId = s.users.cad.id;
  await t.sales.post(`/projects/${s.p1}/comments`, { body: `Please check the drawing @[E2E cad](${cadId})` });
  const cadNotes = await t.cad.get('/notifications');
  const mention = cadNotes.items.find((x) => x.type === 'MENTION');
  assert.ok(mention);
  assert.match(mention.body, /@E2E cad/);
  ok('@mention notified the CAD user with readable text');
  const dir = await t.salesMember.get('/users/directory');
  assert.ok(dir.length >= 10);
  ok('every user can load the colleague directory for mentions');

  // Reports, exports, dashboard
  const rep = await admin.get('/reports/summary');
  assert.ok(rep.stageDurations.find((x) => x.stage === 'SITE_SURVEY').completed >= 1);
  assert.equal(rep.quotation.accepted, 1);
  assert.equal(rep.service.opened, 1);
  assert.equal(rep.service.avgCsat, 5);
  assert.ok(rep.monthly.some((m) => m.collected === 900000));
  ok('reports: stage times, win count, service stats and ₹9,00,000 collected');
  await tail(admin, t);
  console.log(`\nPhase 2 OK: ${passed} checks`);
}

/** Reports, exports and dashboard checks; also runnable alone on a DB that finished phase 2. */
async function tail(admin, t) {
  for (const kind of ['projects', 'stage-durations', 'payments', 'tickets']) {
    // Read raw bytes: fetch().text() strips a UTF-8 BOM, which Excel needs to see.
    const bytes = new Uint8Array(await admin.raw(`/reports/export/${kind}`));
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], `${kind} CSV starts with a UTF-8 BOM`);
    assert.ok(new TextDecoder().decode(bytes).split('\r\n').length > 2, `${kind} CSV has rows`);
  }
  ok('all four CSV exports download with data');
  assert.equal((await t.salesMember.status('GET', '/reports/summary')).status, 403);
  ok('team members cannot open reports (403)');
  const dash = await admin.get('/dashboard/summary');
  assert.equal(dash.kpis.outstandingPayments, 100000);
  assert.equal(dash.kpis.openTickets, 0);
  ok('dashboard shows ₹1,00,000 outstanding and 0 open tickets');

  const jobs = await admin.get('/jobs/status');
  assert.ok(jobs.length >= 0);
}

async function tailOnly() {
  const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  const admin = as(await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD));
  const t = { salesMember: as(await login(s.users.salesMember.email, PASSWORD)) };
  await tail(admin, t);
  console.log(`\nTail OK: ${passed} checks`);
}

const run = phase === 'phase1' ? phase1 : phase === 'phase2' ? phase2 : phase === 'tail' ? tailOnly : null;
if (!run) {
  console.error('Usage: node test/e2e-flow.mjs phase1|phase2|tail');
  process.exit(2);
}
run().catch((e) => {
  console.error(`\n✖ FAILED after ${passed} checks:\n${e.stack ?? e}`);
  process.exit(1);
});
