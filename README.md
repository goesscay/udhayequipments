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
- Stages and allowed moves are defined once in `packages/shared/src/workflow.ts` (`TRANSITIONS`). They follow the company process sheet (`UdhayEquipmentProcess.xlsx`, Nov 2026):

  | # | Stage | Team | Hands over to | Needs |
  |---|---|---|---|---|
  | 1 | Lead & Requirement | Sales | CAD | |
  | 2 | Layout Drawing | CAD | Sales | Layout drawing |
  | 3 | Customer Approval - Layout | Sales | Operations | (revise → back to CAD) |
  | 4 | Quotation Preparation | Operations | Sales | Quotation |
  | 5 | Customer Approval - Quotation & PO | Sales | Operations | Purchase order / PO mail |
  | 6 | BOQ & Soft Drawing | Operations | Project | BOQ, soft drawing |
  | 7 | Site Survey & Measurement | Project | CAD | Measurement sheet |
  | 8 | MEP Layout | CAD | Admin | MEP layout / CAD drawing |
  | 9 | MEP Layout Approval | Admin (`cad.approve`) | CAD | (reject → back to MEP Layout) |
  | 10 | MEP Layout - Release to Production | CAD | Production | Advance payment (if the rule is on) |
  | 11 | Production | Production | QC | Every item through Laser & Bending → Fabrication → Welding → Polish |
  | 12 | Quality Check (QC) | QC | Dispatch | Every item QC-passed (fail → back to Production) |
  | 13 | Dispatch & Delivery | Dispatch | Project | Trips delivered, proof of delivery |
  | 14 | Installation & Handover | Project | Support & Service | No open snags, handover recorded |
  | 15 | Service & Support | Support & Service | | |

  Migration `20261104000000_process_sheet` moved live projects onto this order: early Site Survey → Layout Drawing, old (post-BOQ) Layout Approval → Site Survey, Quotation Shared → Customer Approval - Quotation & PO, Handover → Installation & Handover. Old history keeps the retired stage names (`RETIRED_STAGES`). The previous Settings → Workflow changes were saved as the `workflow.beforeProcessSheet` app setting and reset; added stages were kept.
- Every stage change goes through `WorkflowService.transition()` (`apps/api/src/projects/workflow.service.ts`), which:
  1. locks the project row
  2. checks permission and team
  3. checks required documents and reasons
  4. closes the current stage visit and opens the next one with an SLA due date
  5. writes the timeline and the audit log, all in one transaction
- Revision loops (quotation, layout, CAD rejection) reopen an earlier stage as a new cycle. The stage goes back to whoever handled it last, and a new document version is required.
- **Handoffs:** the receiving team must *Accept* the handoff, and acceptance time is recorded.
- **Super Admin overrides** (project page → *Admin controls*), each needing a reason and shown on the timeline:
  - **Status:** set any status. Setting a lost, completed or cancelled project back to Active or On hold reopens it at the stage it closed in.
  - **Move to stage:** jump to any stage, skipping document, payment and approval checks. The receiving team is notified.
  - **Hand to a department or person:** give the current stage to any team and/or person. The stage row's team changes, so it shows in that team's queue and its members can act on it. Permission checks use the team holding the open stage, not the stage's default team.
  - The *Assign to* list on the current-stage box shows everyone, grouped by team, for Super Admins.
- SLA hours per stage are seeded into `StageSetting` and can be changed per stage.
- **Settings → Workflow** (`settings.manage`): **add new stages**, **change the order** (↑/↓), rename stages and action buttons, move a stage to another team, switch off optional stages (Layout Drawing, Customer Approval - Layout, Site Survey, MEP Layout, MEP Layout Approval, Release to Production, QC, Dispatch) and side paths (revisions, rejections, mark lost), and change which documents and reasons each step needs.
  - Only the differences from the built-in workflow are stored, as JSON in `AppSetting` (key `workflow`), and resolved by `resolveWorkflow()` in `packages/shared/src/workflow-config.ts`. The API holds the resolved workflow in memory (`WorkflowConfigService`) and every page reads it from `GET /api/workflow`.
  - A switched-off stage is skipped going forward; return paths into it are hidden. Projects already in it can still finish it.
  - Every main forward step goes to the next stage in use in the configured order. An added stage gets a "Send to <next stage>" step and an optional "Send back" step (with a reason). Added stages have codes like `X_7KQ2MD`; stage columns are `VARCHAR(40)` since migration `20261103000000_custom_stages`.
  - Order rules (`ORDER_RULES`): Lead first, Service last; Layout Drawing → Layout Approval; Quotation → Customer Approval (Quotation & PO) → BOQ → Production; MEP Layout → MEP Approval → Release → Production → QC → Dispatch → Installation & Handover keep their order. Site Survey can move freely. A return path that would now point forward is hidden.
  - An added stage that projects have been through can be switched off but not deleted.
  - Moving a stage to another team also moves its open work. The advance-payment check runs on any step into Production, so it still applies when Release to Production is off.

### Auth
- Implemented natively in NestJS: argon2 password hashes, a 15-minute JWT access token held in memory, and a 30-day rotating refresh token in an httpOnly `SameSite=Strict` cookie. Reuse of a rotated token revokes every session of that user.
- Login is rate-limited.
- The web app proxies `/api/*` to the API, so the cookie stays first-party.

### RBAC
- Each permission is a `resource.action` key granted to a role with a scope of `OWN`, `TEAM` or `ALL`.
- Global guards handle authentication (`JwtAuthGuard`) and whether the permission exists (`PermissionsGuard`). `AccessService` applies the scope inside database queries, so users never receive rows outside their scope.
- Default roles: Super Admin, Admin, Operations, Accounts, Purchase, Sales, CAD, Project and Service. Super Admin can edit roles via `PUT /api/roles/:id/permissions`.
- Prices and commercial documents (quotation, BOQ) are hidden from roles without `price.view`.

### Operations (Phase 2)
Each project gets tabs that appear as it reaches the relevant stage.

| Tab | Who works in it | What it does | Rule it enforces |
|---|---|---|---|
| **Payments** | Admin (`payment.manage`); visible with `price.view` | Advance / before-dispatch / final milestones, receipts (mode + reference), waive, undo | Optional (Settings → Rules): no release to Production without the advance; no dispatch without the before-dispatch payment |
| **Production** | Production team (`production.manage`); QC team for checks | One job card per equipment item, moved through the four levels (Laser & Bending, Fabrication, Welding, Polish, Done) with counts per level; paste a BOQ list (`3 x Sink unit`, `Sink unit - 3 nos`). At the QC stage the QC team passes or fails each item. | "Production done" needs every item Done; "QC passed" needs every item QC-passed |
| **Dispatch** | Dispatch team (`dispatch.manage`) | Trips with vehicle, driver, DC / e-way bill, delivery with on-screen signature or photo of the signed challan; Dispatch board across projects | "Delivered to site" needs every trip delivered |
| **Site & handover** | Project team (`installation.manage`) | Snag list; handover with customer signature, warranty months, training; printable certificate (`/print/handover/:id`) | "Handed over" needs no open snags and a recorded handover |
| **Service** | Service team (`service.manage`) | Tickets (SRV-YYYY-NNNN) with warranty check, priority-based due time, visits, resolution, customer rating | Overdue tickets alert the technician and Service head |

- **Team-owned modules:** a permission with Team/Own scope works only for members of the owning team, while All scope (Admin) works everywhere.
- **Reports** (`report.view`): stage times (average, median, % late), quotation win rate, lost reasons, monthly new/won projects, value won vs collected, service stats, and CSV exports (Excel-ready, formula-safe).
- **@mentions** in comments notify colleagues who can see the project.
- **Phone photos** are shrunk in the browser before upload (about 1600 px JPEG) to save server disk.

### Testing
- `pnpm test`: unit tests for the pure logic (SLA levels, item parsing, warranty dates, report maths, CSV, mentions).
- `apps/api/test/e2e-flow.mjs`: an end-to-end upgrade test. Phase 1 runs against the previous release to create users and a project at Head Approval. Phase 2 runs against the new release on the same database: it checks the migration and new permissions, then walks payments → production → dispatch → snags → handover → service, including every blocked step and permission denial. **Only ever point it at a throwaway database**; it refuses the production domain.

### Teams and roles
- **Teams** (who owns each workflow stage): Management, Sales, Project, **Operations** (Quotation Preparation and BOQ & Soft Drawing; called "Admin" before 23 Oct 2026), CAD, Production, **Quality Check (QC)** (added Nov 2026; move QC staff into it from Users), Dispatch, Support & Service, plus **Accounts** and **Purchase** (no workflow stage of their own; added Nov 2026).
- **System roles:**
  - **Super Admin:** everything.
  - **Admin:** all projects, users, payments.
  - **Operations:** for the Operations team. Covers quotations, BOQ, documents, prices and payments on its team's projects; no user or role management.
  - **Accounts:** payments, prices and reports on every project; no workflow actions.
  - **Purchase:** read-only access to every project, its BOQ and drawings.
  - **Sales**, **CAD**, **Project**, **Service:** one per department; anyone in the team can act on, and upload documents for, its stages. Sales also creates leads and customers and sees prices; Project manages snags and handover; Service handles tickets.
  - MEP Layout Approval needs `cad.approve`, which only Super Admin has by default; grant it to Admin in Settings → Roles if Admins should approve.
  - Overall Head, Team Head, Team Member and Viewer were removed in Nov 2026 (migration `20261105000000_department_roles`). Production, QC and Dispatch have no role yet: create one with code `PRODUCTION`, `QC` or `DISPATCH` and the Excel import uses it for that department.

### Staff accounts
- **Sign-in:** people sign in with their **employee code** (e.g. `EMP005`), **mobile number** or email. Email is optional.
- **Profile fields:** employee code, display name, full name, mobile, email, gender, department, employment type, date of joining, date of birth, status (active/inactive), role and team.
- **Users → Import from Excel:**
  - Upload the HR sheet (columns: Code, Employee Name, Display Name, Mobile number, Gender, Department Name, Status, Employment Type, Date of Joining, Date of Birth).
  - A preview shows each person's mapped team and role before anything is saved.
  - Importing then creates everyone with a random temporary password, shown once with a CSV download.
  - Department → team and role (`DEPARTMENT_MAP`): Operations, Accounts, Purchase, Sales, CAD (Design Engineer), Project (Project Co-ordinator) and Service (Service & Support) each get the team and role of that name; Management gets Admin. Accounts and Purchase became teams in Nov 2026.
  - Everyone starts as a Team Member in their team; promote team heads in Users → Edit.
- **Deleting a user (Super Admin only):** Users → trash icon, or Edit → Delete user. It is a soft delete: the person can't sign in and leaves the list, while past projects, comments and the audit log keep their name. Their employee code, mobile and email are freed for reuse (the old values are kept in the audit log). Their open stages and service tickets go back to the team. You can't delete yourself or the last active Super Admin.
- **Temporary passwords:** passwords set by an admin (new user, import or reset) are temporary. The API refuses everything except signing out and changing the password until the person chooses their own.

### Demo data
Settings → Demo data loads 14 sample projects (codes `DEMO-YYYY-NNNN`, shown with a DEMO badge), spread across every stage. They include payments, job cards, trips, snags, a handover and a service ticket, and are assigned to real staff in each team. Demo data doesn't use real project numbers. **Remove demo data** deletes it all in one go.

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

### Production: https://app.udhayequipments.com (Hostinger Cloud, Node.js)
- **One Node process** serves everything. `node apps/api/dist/main.js` answers `/api/*` with NestJS and hands every other path to the built Next.js app (`apps/web/.next`).
- **Deploys:** every push to `main` on `goesscay/udhayequipments` builds on Hostinger. The build installs with pnpm and runs `node scripts/build.mjs`; build logs are in hPanel → Node.js.
- **On start-up** the server starts listening right away (Hostinger expects that within ~3 s). Requests wait at a warm-up gate while it applies pending Prisma migrations, syncs reference data (teams, permissions, system roles, stage SLAs) and loads the web app; scheduled jobs start only after that. Turn these off with `DB_AUTO_MIGRATE=false` / `DB_AUTO_SEED=false`.
- **Database:** MySQL `u155045157_udhay_tracker`, created by hPanel. `DATABASE_URL` / `DB_*` are written into the app's environment, and the app rewrites host `localhost` to `127.0.0.1`.
- **Uploads:** `/home/u155045157/udhay-uploads`, outside the deploy folder so they survive redeploys. Back this folder up together with the database.
- **Scheduled jobs:** these run in-process. An hPanel cron job also calls `/api/jobs/run` every 10 minutes as a backup.
- **Environment variables:** edit them one at a time in hPanel. Avoid the API's "replace all" call, because the generated database password can't be read back and would be lost.
- **First Super Admin:** add `SEED_SUPERADMIN_EMAIL` and `SEED_SUPERADMIN_PASSWORD` in hPanel → environment variables, then restart. The account is created on start-up if that email doesn't exist yet. Remove the password variable after signing in.

## Not yet built (next steps from PLAN.md)
- Offline mode and push notifications. The app can be installed on phones (manifest + icons) but needs a connection.
- Phase 3: customer tracking/approval link, quotation & BOQ builder with an equipment catalogue, Tally/Zoho integration, AMC renewals.
- Web UI tests (the API is covered by unit tests and the end-to-end upgrade test).
