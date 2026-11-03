import { Injectable } from '@nestjs/common';
import type { TransitionDef } from '@udhay/shared';
import type { Db } from '../common/types';
import { AppRulesService } from '../settings/app-rules.service';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Business rules that must hold before a workflow step, beyond permissions and documents.
 * Returns human-readable reasons; an empty list means the step may go ahead.
 */
@Injectable()
export class GatesService {
  constructor(private readonly rules: AppRulesService) {}

  async blockers(db: Db, projectId: string, def: TransitionDef): Promise<string[]> {
    // Keyed on the destination, so it still applies when earlier stages are switched off in Settings → Workflow.
    if (def.to === 'PRODUCTION' && def.from !== 'PRODUCTION') {
      const rules = await this.rules.get();
      if (rules.advanceBeforeProduction && !(await this.settled(db, projectId, 'ADVANCE'))) {
        return ['Advance payment not received yet'];
      }
      return [];
    }

    switch (`${def.from}:${def.action}`) {
      case 'PRODUCTION:COMPLETE': {
        const items = await db.productionItem.findMany({ where: { projectId }, select: { status: true } });
        if (!items.length) return ['Add the production items (job cards) first'];
        const unfinished = items.filter((i) => i.status !== 'DONE').length;
        return unfinished ? [`${plural(unfinished, 'item')} not through all four levels (up to Polish)`] : [];
      }

      case 'QC:APPROVE': {
        const items = await db.productionItem.findMany({ where: { projectId }, select: { qcStatus: true } });
        if (!items.length) return ['There are no production items to check'];
        const open = items.filter((i) => i.qcStatus !== 'PASSED').length;
        return open ? [`${plural(open, 'item')} without a passed quality check`] : [];
      }

      case 'DISPATCH:DELIVER': {
        const trips = await db.dispatchTrip.findMany({
          where: { projectId, status: { not: 'CANCELLED' } },
          select: { status: true },
        });
        if (!trips.length) return ['Plan and deliver at least one dispatch trip'];
        const pending = trips.filter((t) => t.status !== 'DELIVERED').length;
        return pending ? [`${plural(pending, 'trip')} not delivered yet`] : [];
      }

      case 'INSTALLATION:HANDOVER': {
        const out: string[] = [];
        const open = await db.snag.count({ where: { projectId, status: 'OPEN' } });
        if (open) out.push(`${plural(open, 'open snag')} to close first`);
        const handover = await db.handover.findUnique({ where: { projectId }, select: { id: true } });
        if (!handover) out.push('Record the handover (customer sign-off and warranty) first');
        return out;
      }

      default:
        return [];
    }
  }

  /** Reason dispatch can't start yet, or null. Used when a trip is marked as dispatched. */
  async dispatchBlocker(db: Db, projectId: string): Promise<string | null> {
    const rules = await this.rules.get();
    if (rules.preDispatchBeforeDispatch && !(await this.settled(db, projectId, 'PRE_DISPATCH'))) {
      return 'Before-dispatch payment not received yet';
    }
    return null;
  }

  /** At least one milestone of this kind is received or waived. */
  private async settled(db: Db, projectId: string, kind: 'ADVANCE' | 'PRE_DISPATCH') {
    const n = await db.paymentMilestone.count({
      where: { projectId, kind, status: { in: ['RECEIVED', 'WAIVED'] } },
    });
    return n > 0;
  }
}
