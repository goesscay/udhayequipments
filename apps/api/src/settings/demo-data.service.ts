import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { STAGES, STAGE_BY_CODE, itemProgress, stageIndex, type Priority, type ProductionLevel, type StageCode, type TeamCode } from '@udhay/shared';
import { AuditService } from '../audit/audit.module';
import { nextCode } from '../common/counter';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;

interface DemoProject {
  customer: string;
  contact: string;
  phone: string;
  city: string;
  title: string;
  requirement: string;
  value: number;
  priority: Priority;
  stage: StageCode;
  /** Days the project has been in its current stage; past the stage's target makes it overdue. */
  daysInStage: number;
  status?: 'ACTIVE' | 'ON_HOLD' | 'LOST' | 'COMPLETED';
  holdReason?: string;
}

/** Fictional customers. Names are invented and do not refer to real businesses. */
const PROJECTS: DemoProject[] = [
  { customer: 'Saffron Court Hotel', contact: 'Mr. Raghavan', phone: '+919800100101', city: 'Chennai', title: 'Main kitchen, 180 covers', requirement: 'South & North Indian a la carte kitchen with tandoor section, bakery corner and cold room.', value: 2850000, priority: 'HIGH', stage: 'LEAD', daysInStage: 1 },
  { customer: 'Green Leaf Veg Restaurant', contact: 'Ms. Lakshmi', phone: '+919800100102', city: 'Coimbatore', title: 'Kitchen renovation', requirement: 'Replace ranges and dosa plates, add exhaust hood with fresh-air unit.', value: 940000, priority: 'NORMAL', stage: 'LAYOUT_DRAWING', daysInStage: 4 },
  { customer: 'Marina Bay Seafood', contact: 'Mr. Joseph', phone: '+919800100103', city: 'Chennai', title: 'Seafood restaurant kitchen', requirement: 'Wet & dry prep areas, live tank wash zone, 2 x six-burner ranges.', value: 1650000, priority: 'NORMAL', stage: 'QUOTATION_PREP', daysInStage: 1 },
  { customer: 'Sunrise Hospital Canteen', contact: 'Dr. Meenakshi', phone: '+919800100104', city: 'Madurai', title: 'Hospital canteen, 600 meals/day', requirement: 'Bulk cooking kettles, steam cooking, tray line and dishwash area.', value: 3200000, priority: 'URGENT', stage: 'CUSTOMER_DECISION', daysInStage: 9 },
  { customer: 'Royal Spice Biryani House', contact: 'Mr. Imran', phone: '+919800100105', city: 'Trichy', title: 'Central biryani kitchen', requirement: 'Dum biryani stations, 4 x large bulk burners, prep tables and storage racks.', value: 1280000, priority: 'HIGH', stage: 'SITE_SURVEY', daysInStage: 2 },
  { customer: "St. Mary's College Hostel", contact: 'Fr. Thomas', phone: '+919800100106', city: 'Salem', title: 'Hostel mess kitchen', requirement: 'Mess for 900 students: bulk cookers, chapati line, rice boilers, washing area.', value: 2400000, priority: 'NORMAL', stage: 'CAD_DRAWING', daysInStage: 6 },
  { customer: 'Coastal Kitchen Café', contact: 'Ms. Priya', phone: '+919800100107', city: 'Pondicherry', title: 'Café and bakery kitchen', requirement: 'Deck oven, planetary mixer, under-counter refrigeration, display counters.', value: 760000, priority: 'NORMAL', stage: 'HEAD_APPROVAL', daysInStage: 1 },
  { customer: 'Kovai Grand Banquets', contact: 'Mr. Senthil', phone: '+919800100108', city: 'Coimbatore', title: 'Banquet kitchen, 1500 guests', requirement: 'Banquet production kitchen with live counters and holding cabinets.', value: 4100000, priority: 'HIGH', stage: 'PRODUCTION', daysInStage: 12 },
  { customer: 'Hill View Resort', contact: 'Mr. Arun', phone: '+919800100109', city: 'Ooty', title: 'Resort kitchen and coffee shop', requirement: 'Main kitchen, room-service pantry and coffee shop back counter.', value: 2250000, priority: 'NORMAL', stage: 'DISPATCH', daysInStage: 2 },
  { customer: 'Temple Annadhanam Hall', contact: 'Mr. Subramani', phone: '+919800100110', city: 'Kumbakonam', title: 'Annadhanam kitchen', requirement: 'Large steam cooking system for 2000 meals, vegetable prep and serving line.', value: 1850000, priority: 'URGENT', stage: 'INSTALLATION', daysInStage: 3 },
  { customer: 'Urban Tiffin Co.', contact: 'Ms. Divya', phone: '+919800100111', city: 'Chennai', title: 'Cloud kitchen', requirement: 'Compact cloud kitchen for three brands with shared prep.', value: 690000, priority: 'NORMAL', stage: 'QC', daysInStage: 1 },
  { customer: 'Lakeside Fine Dine', contact: 'Mr. Karthik', phone: '+919800100112', city: 'Chennai', title: 'Fine-dining kitchen', requirement: 'Induction line, sous-vide station, pastry section.', value: 1980000, priority: 'NORMAL', stage: 'SERVICE', daysInStage: 40 },
  { customer: 'Metro Food Court', contact: 'Mr. Ramesh', phone: '+919800100113', city: 'Bengaluru', title: 'Food court counters', requirement: 'Six counters with shared dishwash.', value: 1450000, priority: 'LOW', stage: 'CUSTOMER_DECISION', daysInStage: 5, status: 'LOST' },
  { customer: 'Palm Grove Inn', contact: 'Mr. Vinod', phone: '+919800100114', city: 'Kochi', title: 'Hotel kitchen upgrade', requirement: 'Phase 2 upgrade, waiting for civil work at site.', value: 1100000, priority: 'NORMAL', stage: 'LAYOUT_APPROVAL', daysInStage: 7, status: 'ON_HOLD', holdReason: 'Site civil work delayed by the customer' },
];

const ACTIONS: Partial<Record<StageCode, string>> = {
  LEAD: 'SUBMIT',
  LAYOUT_DRAWING: 'SUBMIT',
  LAYOUT_APPROVAL: 'APPROVE',
  QUOTATION_PREP: 'SUBMIT',
  CUSTOMER_DECISION: 'ACCEPT',
  BOQ_DRAWING: 'SUBMIT',
  SITE_SURVEY: 'SUBMIT',
  CAD_DRAWING: 'SUBMIT',
  HEAD_APPROVAL: 'APPROVE',
  CAD_RELEASE: 'SUBMIT',
  PRODUCTION: 'COMPLETE',
  QC: 'APPROVE',
  DISPATCH: 'DELIVER',
  INSTALLATION: 'HANDOVER',
};

/** Sample projects for training and showing the app; flagged isDemo and removable together. */
@Injectable()
export class DemoDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status() {
    const [projects, customers] = await Promise.all([
      this.prisma.project.count({ where: { isDemo: true } }),
      this.prisma.customer.count({ where: { isDemo: true } }),
    ]);
    return { loaded: projects > 0, projects, customers };
  }

  async load(actor: AuthUser) {
    if ((await this.status()).loaded) throw new BadRequestException('Demo data is already loaded. Remove it first to reload.');
    const people = await this.peopleByTeam(actor.id);
    const slas = new Map((await this.prisma.stageSetting.findMany()).map((s) => [s.stage, s.slaHours]));
    const hours = (s: StageCode) => slas.get(s) ?? STAGE_BY_CODE[s].slaHours;

    let created = 0;
    for (const d of PROJECTS) {
      await this.prisma.$transaction(async (tx) => {
        await this.createProject(tx, d, people, hours, actor.id);
      }, { timeout: 30_000 });
      created++;
    }
    await this.audit.log({ actorId: actor.id, entity: 'settings', entityId: 'demo_data', action: 'load', data: { projects: created } });
    return this.status();
  }

  async remove(actor: AuthUser) {
    // Cascades remove stages, history, comments, notifications, payments, items, trips, snags, handover and tickets.
    const projects = await this.prisma.project.deleteMany({ where: { isDemo: true } });
    const customers = await this.prisma.customer.deleteMany({ where: { isDemo: true, projects: { none: {} } } });
    await this.audit.log({ actorId: actor.id, entity: 'settings', entityId: 'demo_data', action: 'remove', data: { projects: projects.count, customers: customers.count } });
    return { removedProjects: projects.count, removedCustomers: customers.count };
  }

  /** First two active users of each team, so demo work lands in real people's queues. */
  private async peopleByTeam(fallback: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null, team: { isNot: null } },
      include: { team: true },
      orderBy: [{ employeeCode: 'asc' }, { createdAt: 'asc' }],
    });
    const byTeam = new Map<TeamCode, string[]>();
    for (const u of users) {
      const list = byTeam.get(u.team!.code) ?? [];
      if (list.length < 2) list.push(u.id);
      byTeam.set(u.team!.code, list);
    }
    return (team: TeamCode, n = 0) => {
      const list = byTeam.get(team);
      return list?.length ? list[n % list.length] : fallback;
    };
  }

  private async createProject(
    tx: Tx,
    d: DemoProject,
    person: (team: TeamCode, n?: number) => string,
    hours: (s: StageCode) => number,
    actorId: string,
  ) {
    const now = Date.now();
    const sales = person('SALES', d.value % 2);
    const target = stageIndex(d.stage);
    // Work backwards from today: each finished stage took a little under its target time.
    const durations = STAGES.slice(0, target).map((s, i) => Math.max(0.5, (hours(s.code) / 24) * (0.55 + ((i * 7) % 5) / 10)));
    let cursor = now - d.daysInStage * DAY - durations.reduce((a, b) => a + b, 0) * DAY;

    const customer = await tx.customer.create({
      data: { name: d.customer, contactPerson: d.contact, phone: d.phone, city: d.city, address: `${d.city}, Tamil Nadu`, isDemo: true, createdById: sales },
    });
    const status = d.status ?? 'ACTIVE';
    const project = await tx.project.create({
      data: {
        code: await nextCode(tx, 'DEMO', 'demo'),
        title: d.title,
        customerId: customer.id,
        siteAddress: `${d.customer}, ${d.city}`,
        city: d.city,
        requirement: d.requirement,
        estimatedValue: d.value,
        priority: d.priority,
        status,
        holdReason: d.holdReason ?? null,
        currentStage: d.stage,
        currentTeam: STAGE_BY_CODE[d.stage].team,
        salesOwnerId: sales,
        createdById: sales,
        isDemo: true,
        createdAt: new Date(cursor),
        closedAt: status === 'LOST' ? new Date(now - DAY) : null,
      },
    });
    await tx.stageTransition.create({
      data: { projectId: project.id, fromStage: null, toStage: 'LEAD', action: 'CREATE', byUserId: sales, createdAt: new Date(cursor) },
    });

    for (let i = 0; i < target; i++) {
      const s = STAGES[i];
      const owner = s.team === 'SALES' ? sales : person(s.team, i);
      const started = cursor;
      const done = cursor + durations[i] * DAY;
      await tx.projectStage.create({
        data: {
          projectId: project.id, stage: s.code, team: s.team, status: 'DONE', assigneeId: owner,
          startedAt: new Date(started), acceptedAt: new Date(started + 2 * 3_600_000), acceptedById: owner,
          dueAt: new Date(started + hours(s.code) * 3_600_000), completedAt: new Date(done),
        },
      });
      await tx.stageTransition.create({
        data: { projectId: project.id, fromStage: s.code, toStage: STAGES[i + 1].code, action: ACTIONS[s.code] ?? 'SUBMIT', byUserId: owner, createdAt: new Date(done) },
      });
      cursor = done;
    }

    const cur = STAGE_BY_CODE[d.stage];
    const curOwner = cur.team === 'SALES' ? sales : person(cur.team);
    const started = now - d.daysInStage * DAY;
    const dueAt = new Date(started + hours(d.stage) * 3_600_000);
    await tx.projectStage.create({
      data: {
        projectId: project.id, stage: d.stage, team: cur.team,
        status: status === 'LOST' ? 'DONE' : 'OPEN',
        assigneeId: curOwner,
        startedAt: new Date(started),
        // A couple of fresh handoffs are left unaccepted so My Queue shows both kinds.
        acceptedAt: d.daysInStage <= 1 ? null : new Date(started + 3 * 3_600_000),
        acceptedById: d.daysInStage <= 1 ? null : curOwner,
        dueAt,
        completedAt: status === 'LOST' ? new Date(now - DAY) : null,
      },
    });
    await tx.project.update({ where: { id: project.id }, data: { stageDueAt: status === 'ACTIVE' || status === 'ON_HOLD' ? dueAt : null } });

    if (status === 'LOST') {
      await tx.stageTransition.create({
        data: { projectId: project.id, fromStage: d.stage, toStage: null, action: 'MARK_LOST', reason: 'Customer chose a lower quote from a local fabricator', byUserId: sales, createdAt: new Date(now - DAY) },
      });
    }
    if (status === 'ON_HOLD') {
      await tx.stageTransition.create({
        data: { projectId: project.id, fromStage: d.stage, toStage: d.stage, action: 'HOLD', reason: d.holdReason, byUserId: actorId, createdAt: new Date(now - 2 * DAY) },
      });
    }

    await this.operations(tx, project.id, d, target, person, sales, now);
  }

  /** Payments, job cards, trips, snags, handover and a ticket, matching how far the project got. */
  private async operations(tx: Tx, projectId: string, d: DemoProject, target: number, person: (team: TeamCode, n?: number) => string, sales: string, now: number) {
    const admin = person('OPERATIONS');
    if (target >= stageIndex('BOQ_DRAWING')) {
      const split: ['ADVANCE' | 'PRE_DISPATCH' | 'FINAL', string, number][] = [
        ['ADVANCE', 'Advance (50%)', 0.5],
        ['PRE_DISPATCH', 'Before dispatch (40%)', 0.4],
        ['FINAL', 'Final on handover (10%)', 0.1],
      ];
      for (const [kind, label, pct] of split) {
        const received =
          (kind === 'ADVANCE' && target >= stageIndex('PRODUCTION')) ||
          (kind === 'PRE_DISPATCH' && target >= stageIndex('INSTALLATION')) ||
          (kind === 'FINAL' && target >= stageIndex('SERVICE'));
        await tx.paymentMilestone.create({
          data: {
            projectId, kind, label, amount: Math.round(d.value * pct), createdById: admin,
            status: received ? 'RECEIVED' : 'PENDING',
            receivedAt: received ? new Date(now - (20 - stageIndex(kind === 'ADVANCE' ? 'PRODUCTION' : 'DISPATCH')) * DAY) : null,
            receivedAmount: received ? Math.round(d.value * pct) : null,
            mode: received ? (kind === 'ADVANCE' ? 'Bank transfer' : 'UPI') : null,
            reference: received ? `DEMO-UTR-${Math.round(d.value * pct)}` : null,
            recordedById: received ? admin : null,
          },
        });
      }
    }

    if (target >= stageIndex('PRODUCTION')) {
      const items = ['Three-burner range', 'Exhaust hood with fresh air', 'Work table with undershelf', 'Double-bowl sink unit', 'Four-door refrigerator', 'Dishwash table'];
      const checker = person('QC');
      const finished = target > stageIndex('PRODUCTION');
      // At Production: items spread over the four levels. At QC: all made, two already checked.
      const levels: (ProductionLevel | 'DONE' | null)[] = ['DONE', 'POLISH', 'WELDING', 'FABRICATION', 'LASER_BENDING', null];
      for (let i = 0; i < items.length; i++) {
        const at = finished ? 'DONE' : levels[i];
        const status = at === 'DONE' ? 'DONE' : at ? 'IN_PROGRESS' : 'NOT_STARTED';
        const level = at === 'DONE' ? 'POLISH' : at;
        const passed = target > stageIndex('QC') || (target === stageIndex('QC') && i < 2);
        await tx.productionItem.create({
          data: {
            projectId, name: items[i], quantity: i === 2 ? 3 : 1, sortOrder: i,
            status, level, progress: itemProgress(status, level),
            qcStatus: passed ? 'PASSED' : 'PENDING',
            qcById: passed ? checker : null,
            qcAt: passed ? new Date(now - 3 * DAY) : null,
          },
        });
      }
    }

    if (target >= stageIndex('DISPATCH')) {
      const delivered = target > stageIndex('DISPATCH');
      await tx.dispatchTrip.create({
        data: {
          projectId, tripNo: 1, plannedDate: new Date(now - (delivered ? 6 : 0) * DAY), vehicleNo: 'TN 37 AB 4512', driverName: 'Murugan', driverPhone: '+919800100199',
          challanNo: `DC-${d.phone.slice(-4)}`, status: delivered ? 'DELIVERED' : 'IN_TRANSIT', dispatchedAt: new Date(now - (delivered ? 6 : 0.2) * DAY),
          deliveredAt: delivered ? new Date(now - 5 * DAY) : null, receivedByName: delivered ? d.contact : null, createdById: person('DISPATCH'),
        },
      });
    }

    if (target >= stageIndex('INSTALLATION')) {
      const project = person('PROJECT');
      await tx.snag.create({
        data: { projectId, title: 'Hood duct joint needs resealing', status: target > stageIndex('INSTALLATION') ? 'RESOLVED' : 'OPEN', raisedById: project, resolvedById: target > stageIndex('INSTALLATION') ? project : null, resolution: target > stageIndex('INSTALLATION') ? 'Resealed and tested' : null, resolvedAt: target > stageIndex('INSTALLATION') ? new Date(now - 2 * DAY) : null },
      });
    }

    if (target >= stageIndex('SERVICE')) {
      const signed = new Date(now - d.daysInStage * DAY);
      const end = new Date(signed);
      end.setMonth(end.getMonth() + 12);
      await tx.handover.create({
        data: { projectId, signedByName: d.contact, signedAt: signed, warrantyMonths: 12, warrantyStart: signed, warrantyEnd: end, trainingDone: true, recordedById: person('PROJECT') },
      });
      await tx.serviceTicket.create({
        data: {
          code: await nextCode(tx, 'DSRV', 'demo-ticket'), projectId, title: 'Refrigerator not cooling enough', description: 'Chef reports the four-door refrigerator holds 9°C instead of 4°C.',
          priority: 'HIGH', status: 'ASSIGNED', underWarranty: true, contactName: d.contact, contactPhone: d.phone,
          assigneeId: person('SERVICE'), raisedById: person('SERVICE'), dueAt: new Date(now + 6 * 3_600_000),
        },
      });
    }

    if (target >= stageIndex('CUSTOMER_DECISION')) {
      await tx.comment.create({
        data: { projectId, stage: d.stage, body: 'Customer asked to keep the dishwash area near the back door.', authorId: sales, createdAt: new Date(now - 2 * DAY) },
      });
    }
  }
}
