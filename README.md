# UDHAY Project Tracker

Tracks every commercial-kitchen project from first sales meeting to after-sales service, across all teams. See [PLAN.md](PLAN.md) for the full product plan.

## Stack
pnpm + Turborepo monorepo:

| Path | What |
|---|---|
| `apps/api` | NestJS 11 REST API, Prisma 6, MySQL 8.4, Swagger at `/api/docs` |
| `apps/web` | Next.js 15 (App Router), Tailwind v4, TanStack Query, RHF + Zod, Recharts |
| `packages/shared` | Single source of truth: stages, teams, permissions, default roles, **workflow transitions**, Zod schemas, API types |

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # set DATABASE_URL, JWT_ACCESS_SECRET, JOBS_SECRET
cp apps/web/.env.example apps/web/.env.local
# Needs a MySQL 8 server (local install). No Docker or Redis required.
pnpm --filter @udhay/shared build
pnpm db:migrate                              # creates tables (first run: name the migration "init")
pnpm db:seed                                 # teams, permissions, roles, SLAs, super admin (+ demo users)
pnpm dev                                     # web → http://localhost:3000, api → http://localhost:4000/api
```

Sign in with the seed credentials from `apps/api/.env` (`SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`). Demo users are listed in `apps/api/prisma/seed.ts` and share `SEED_DEMO_PASSWORD`. **Change these before any shared deployment.**

## How it works

### Workflow engine
- Stages and allowed moves are defined once in `packages/shared/src/workflow.ts` (`TRANSITIONS`).
- Every stage change goes through `WorkflowService.transition()` (`apps/api/src/projects/workflow.service.ts`), which:
  1. locks the project row
  2. checks permission and team
  3. checks required documents and reasons
  4. closes the current stage visit and opens the next one with an SLA due date
  5. writes the timeline and the audit log, all in one transaction
- Revision loops (quotation, layout, CAD rejection) reopen an earlier stage as a new cycle. The stage goes back to whoever handled it last, and a new document version is required.
- **Handoffs:** the receiving team must *Accept* the handoff, and acceptance time is recorded.
- SLA hours per stage are seeded into `StageSetting` and can be changed per stage.

### Auth
- Implemented natively in NestJS: argon2 password hashes, a 15-minute JWT access token held in memory, and a 30-day rotating refresh token in an httpOnly `SameSite=Strict` cookie. Reuse of a rotated token revokes every session of that user.
- Login is rate-limited.
- The web app proxies `/api/*` to the API, so the cookie stays first-party.

### RBAC
- Each permission is a `resource.action` key granted to a role with a scope of `OWN`, `TEAM` or `ALL`.
- Global guards handle authentication (`JwtAuthGuard`) and whether the permission exists (`PermissionsGuard`). `AccessService` applies the scope inside database queries, so users never receive rows outside their scope.
- Default roles: Super Admin, Admin, Overall Head (CAD approval), Team Head, Team Member and Viewer. Super Admin can edit roles via `PUT /api/roles/:id/permissions`.
- Prices and commercial documents (quotation, BOQ) are hidden from roles without `price.view`.

### Notifications (in-app only)
- `WorkflowService` emits `project.transitioned` / `project.assigned` events after the database transaction commits. `WorkflowNotifier` turns them into notifications:
  - **Handoff:** goes to the stage assignee, or to the whole receiving team if nobody is assigned. CAD approvals go to everyone with `cad.approve`.
  - **Returned for revision:** includes the reason.
  - **Assigned to you.**
  - **Project lost/completed:** goes to the sales owner and admins.
- The person who acted is never notified about their own action.
- The web app polls `/api/notifications/unread-count` every 30 seconds and shows a badge on the bell. The Notifications page lists everything, with mark-read and "mark all read".

### Scheduled jobs (no Redis needed)
`JobRunner` (`apps/api/src/jobs`) runs inside the API process every minute. Each task holds a lease row in the `JobLock` table, so it runs once per interval even with several instances. As a backup when the host restarts or idles the app, an hPanel cron job can trigger it:

```bash
curl -fsS -X POST -H "X-Jobs-Secret: $JOBS_SECRET" https://<api-domain>/api/jobs/run
```

| Task | Every | What it does |
|---|---|---|
| `sla-check` | 10 min | Alerts in steps, once each per stage visit: **due soon** (4h before) goes to the stage owner; **overdue** goes to the owner and team head; **overdue 24h+** also goes to Admin / Super Admin. Thresholds are set in `.env`. The Service stage is exempt. |
| `notification-cleanup` | daily | Deletes read notifications older than 90 days |

`GET /api/jobs/status` (Super Admin) shows the last run, its result and any error for each task.

### Hosting (Hostinger shared Node.js)
- **No Docker, Redis or S3:** MySQL comes from hPanel, and uploads go to local disk (`UPLOAD_DIR` should be outside the deploy folder).
- The web app and the API are two Node apps, for example `app.<domain>` and `api.<domain>`. Set `API_URL` in the web app to the API's address, and `WEB_ORIGIN` in the API to the web app's address.

## Not yet built (next steps from PLAN.md)
- Role editor UI, settings UI, customer list page, and PWA manifest/offline support.
- Phase 2: payments, production job cards, dispatch, service tickets.
- More tests (SLA level rules are covered: `pnpm --filter @udhay/api test`).
