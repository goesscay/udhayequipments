# UDHAY Project Tracker — Product & Technical Plan

**Client:** UDHAY Hospitality Equipment & Service (Est. 1991), a commercial kitchen manufacturer
**Goal:** Track every project from first customer meeting to after-sales service, across 7 teams, with one live dashboard for Super Admin and Admin.
**Platform:** Mobile-first web app (installable PWA), plus desktop.

---

## 1. The idea, refined

What you described is a **stage-gated workflow**: each project passes through fixed stages, each stage belongs to one team, and work moves forward only when a handoff or approval happens. The system should be built around that idea:

> **One project = one timeline.** Every handoff, approval, rejection, file and comment is recorded on it. Each stage has an owner team, a target time (SLA), a checklist and the documents it must produce.

Every role then gets the right view:
- **Team members** see a "My Queue" of the work waiting on them.
- **Team heads** see their team's workload and anything running late.
- **Super Admin / Admin** see all projects, all stages, bottlenecks and delays on one dashboard.

---

## 2. Workflow: stages & handoffs

| # | Stage | Owner team | Key action | Output / required docs | Next |
|---|---|---|---|---|---|
| 1 | **Lead & Requirement** | Sales | Meet customer, capture requirement | Requirement form, cuisine type, seating/covers, budget, photos | → 2 |
| 2 | **Site Survey & Measurement** | Project | Visit site, measure | Measurement sheet, site photos (geo-tagged), utilities (gas, power, water, exhaust) | → 3 |
| 3 | **Quotation Preparation** | Admin | Prepare quotation | Quotation PDF (versioned), amount | → 4 |
| 4 | **Quotation Shared** | Sales | Send to customer, follow up | Sent date, follow-up log | → 5 |
| 5 | **Customer Decision** | Sales | Record outcome | Accepted / Revision requested / Lost (with reason) | Accepted → 6, Revision → 3, Lost → Closed-Lost |
| 6 | **BOQ & Soft Drawing** | Admin | Prepare BOQ and layout spec | BOQ, soft drawing | → 7 |
| 7 | **Customer Layout Approval** | Project | Present to customer | Customer sign-off (signed copy / OTP), revision notes | Approved → 8, Revision → 6 |
| 8 | **CAD Drawing** | CAD | Prepare fabrication drawings | CAD files (DWG/PDF), versioned | → 9 |
| 9 | **Head Approval** | Overall Head | Review CAD | Approve / Reject with comments | Approved → 10, Rejected → 8 |
| 10 | **Production** | Production | Fabricate items, run QC | Job cards per item, % progress, QC checklist | → 11 |
| 11 | **Dispatch & Delivery** | Dispatch | Pack, load, deliver | Packing list, vehicle/driver, delivery challan, proof of delivery (photo + signature) | → 12 |
| 12 | **Installation** | Project | Set up at site | Installation checklist, snag list | → 13 |
| 13 | **Handover** | Project | Hand over to customer | Handover certificate (signed), training done, **warranty starts** | → 14 |
| 14 | **Service & Support** | Support & Service | Handle tickets over warranty / AMC | Tickets, visit reports, CSAT | Ongoing → Closed |

### Workflow rules
- **Handoff = send + accept.** When a team passes work on, the receiving team **acknowledges** it. This ends "we never got it" disputes, and the time between the two is measured.
- **Rejections loop back** (stages 5, 7, 9) with a mandatory reason. Every document keeps its versions (Quotation v1, v2, v3…).
- **Stage gates:** a stage cannot be completed until its required documents and checklist are done. Example: CAD cannot submit without a drawing file.
- **Configurable SLA per stage.** Example: survey within 3 days, quotation within 2 days. Status shows 🟢 on track, 🟡 due soon, 🔴 overdue, with automatic escalation to the team head and then Admin.
- **Hold / Cancel** at any stage, with a reason (customer site not ready, payment pending…).

---

## 3. Enhancements (beyond the brief)

### High value, recommend for v1
1. **Payment milestones as gates.** Kitchen projects usually take an advance, a pre-dispatch payment and a final payment. Production should only start after the advance is received, and dispatch only after the pre-dispatch payment. Admin marks payments; the dashboard shows money outstanding per stage. *(Make the gates configurable on/off.)*
2. **Mobile site toolkit.** Camera upload, geo-tagged/time-stamped photos, measurement form, customer signature on screen. The project team works mostly on site.
3. **Activity timeline & audit log.** Who did what and when, on every project. Nothing can be deleted silently.
4. **Notifications.** In-app plus email for v1. **WhatsApp** (Meta Cloud API) in v2: "Quotation v2 ready for Sharma Hotel", "CAD approval pending 2 days".
5. **Comments & @mentions** on each project/stage, so discussions stay out of scattered WhatsApp groups.
6. **Global search.** Search by project code (e.g. `UDH-2026-0142`), customer, phone or site.

### Strong v2 features
7. **Production job cards.** Break a project into equipment items (cooking range, sink unit, exhaust hood, worktable…), with per-item status, % complete and a QC checklist before dispatch.
8. **Dispatch planning.** Calendar of upcoming dispatches, vehicle/driver, partial dispatches (multiple trips), e-way bill/DC number.
9. **Snag list at installation.** Open issues must be closed before handover.
10. **Service module.** Tickets with priority, technician assignment, warranty/AMC check, visit reports, spare parts used, customer feedback (CSAT).
11. **Lead source & lost-reason analytics.** Where good projects come from and why deals are lost.
12. **Reports & export.** Stage aging, team TAT, conversion rate, monthly revenue by stage. Export to Excel/PDF.

### Later (v3)
13. **Customer portal / tracking link.** The customer sees their project stage, approves drawings online (OTP) and raises service tickets.
14. **In-app quotation/BOQ builder** with an equipment catalogue and price list.
15. **Accounting integration** (Tally / Zoho Books) and material/inventory tracking.
16. **AMC renewals** with reminders.

---

## 4. Users, roles & permissions

### Role hierarchy
| Role | Purpose |
|---|---|
| **Super Admin** | Owner / MD. Full access, including system settings, roles, SLAs, deleting/restoring records and the audit log. Can act as **Overall Head** approver. |
| **Admin** | Operations / office admin. Sees all projects and the full dashboard; prepares quotations and BOQs; manages users (except Super Admin); records payments. |
| **Overall Head / Approver** | Approves CAD drawings (stage 9). Can be a separate person or a Super Admin. Implemented as a *permission*, not a fixed role. |
| **Team Head** (per team) | Sales Head, Project Head, CAD Head, Production Head, Dispatch Head, Service Head. Assigns work within the team and sees team workload and SLA breaches. |
| **Team Member** (per team) | Executive / Engineer / Draftsman / Supervisor / Technician. Works on assigned items. |
| **Viewer / Accounts** (optional) | Read-only, or payment-only access. |

### Permission model (RBAC + scope)
Each permission is **`resource : action : scope`**:
- **Resources:** project, customer, quotation, boq, drawing, cad, production, dispatch, installation, ticket, payment, user, role, settings, report
- **Actions:** view, create, update, submit, approve, reject, assign, delete, export
- **Scope:** `own` (assigned to me) · `team` (my department) · `all`

Roles are **editable by Super Admin** (permission checkboxes), so the client can adjust access without a code change.

### Default matrix (summary)
| | Super Admin | Admin | Team Head | Team Member |
|---|---|---|---|---|
| Dashboard (all projects) | ✅ | ✅ | team only | own queue |
| Create project / lead | ✅ | ✅ | Sales | Sales |
| Act on stage | any | any | own team's stages | own assigned |
| Approve CAD | ✅ (or Approver) | ❌ unless granted | ❌ | ❌ |
| Payments | ✅ | ✅ | view | ❌ |
| Users & roles | ✅ | users only | ❌ | ❌ |
| Settings / SLA / workflow | ✅ | view | ❌ | ❌ |
| Audit log | ✅ | view | ❌ | ❌ |
| Hard delete | ✅ | ❌ (soft delete) | ❌ | ❌ |

Field-level rule: **quotation prices and payment amounts are hidden** from Production, CAD and Dispatch by default.

---

## 5. Dashboards

### Super Admin / Admin: "Command Center" (single screen)
1. **KPI strip:** Active projects · Pipeline value (₹) · Quotations awaiting customer · Overdue stages 🔴 · In production · Dispatches this week · Open service tickets · Payments outstanding (₹)
2. **Stage pipeline:** horizontal bar/funnel showing the project count at each of the 14 stages. Tap a stage to see its projects.
3. **Bottleneck & SLA panel:** projects overdue, sorted by days late, with owner team and person.
4. **Team workload:** per team: pending, in progress, overdue, average turnaround time.
5. **Project list:** code, customer, city, current stage, a progress bar (stage x/14), owner, days in stage, RAG status. Filters: team, stage, city, salesperson, date, value.
6. **Charts (Recharts):** monthly won vs lost, quotation conversion %, stage aging, revenue by stage.
7. **Live activity feed:** latest handoffs, approvals and rejections.

### Project detail page
A header with code, customer, value and RAG status. Under it, a **visual stepper** of all 14 stages (done / current / upcoming, with dates and owner). Tabs: **Timeline · Documents · Tasks/Checklist · Payments · Comments · Service.** A sticky bottom action bar holds the current allowed actions, e.g. *Submit to Admin*, *Approve*, *Request Revision*.

### Team views
- **My Queue:** cards for items waiting on me, sorted by due date, with one-tap actions.
- **Team Board** (heads): a Kanban of the team's stages; assign or reassign members.

---

## 6. UI / UX direction: white, premium, compact, mobile-first

**Brand palette (from the logo):**
| Token | Color | Use |
|---|---|---|
| Background | `#FFFFFF` / surface `#FAFAF9` | White-dominant canvas |
| Text primary | `#1F2328` (charcoal) | Headings, body |
| Text secondary | `#6B7280` | Labels, meta |
| Brand gold | `#B8862B` (hover `#9C7024`) | Primary buttons, active nav, highlights, used sparingly |
| Gold tint | `#F7F0E3` | Selected rows, badges |
| Border | `#ECEAE6` | Hairline 1px dividers |
| Status | green `#16A34A` · amber `#D97706` · red `#DC2626` · blue `#2563EB` | RAG and info only |

**Typography:** *Inter* (or *Plus Jakarta Sans*) for UI and tabular numbers for figures. Base size 14px on desktop and 15px on mobile; headings semibold, not heavy.

**Premium feel comes from restraint:** generous white space with dense data, hairline borders instead of heavy shadows, a 10–12px radius, a single gold accent, subtle 150ms motion, and a consistent icon set (Lucide, from shadcn).

**Mobile patterns:**
- Bottom navigation: **Home · My Queue · Projects · Search · More**
- KPI cards in a 2-column grid; tables become stacked cards on phones
- Bottom sheets for actions and filters; a sticky primary action button
- Large tap targets (44px), camera-first upload, pull-to-refresh
- Installable **PWA** with home-screen icon and push notifications; the site survey form works offline and syncs later

**Desktop:** a collapsible left sidebar, a top bar with global search (⌘K) and notifications bell, and wide data tables.

---

## 7. Technical architecture

### Stack (your choices, with notes)
| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript | Plus **TanStack Query** for data fetching/caching and **next-pwa / Serwist** for PWA |
| UI | Tailwind CSS + shadcn/ui, Lucide icons | Custom theme tokens above |
| Forms | React Hook Form + Zod | **Share Zod schemas** between web and API via a shared package |
| Charts | Recharts | |
| Backend | NestJS, TypeScript | Modular: one module per domain |
| API | REST + Swagger/OpenAPI | Generate a typed client for the frontend from OpenAPI (`orval` / `openapi-typescript`) |
| Validation | DTOs + class-validator | |
| DB | MySQL 8.4 LTS | |
| ORM | Prisma | Migrations, seed for roles/permissions/stages |
| **Auth** | **NestJS-native auth (recommended over Auth.js)** | See below |
| Authorization | NestJS Guards + **CASL** policies | Handles `action/resource/scope` cleanly |
| **Files** | Local disk on the server (outside the deploy folder) | Hostinger shared hosting, so no S3; served only through permission-checked download routes |
| **Jobs** | In-process scheduler with MySQL lease locks, plus an optional hPanel cron call | No Redis on shared hosting; runs SLA checks, escalations and cleanup |
| Realtime (optional) | SSE or Socket.IO | Live dashboard and notification badge |
| Notifications | In-app only (bell with unread count) | Email / WhatsApp deliberately left out for now |

**Why NestJS-native auth instead of Auth.js:** with a separate NestJS API, Auth.js would create two sources of truth for sessions. Keep auth in NestJS:
- Login with email/phone + password (argon2 hash)
- Short-lived **JWT access token** plus a **rotating refresh token** in an httpOnly, Secure, SameSite cookie
- Optional **mobile OTP login** (field staff prefer it)
- Rate limiting (`@nestjs/throttler`), account lockout, password reset, session/device list, forced logout on deactivation

### Repository layout (monorepo: pnpm + Turborepo)
```
udhay/
├─ apps/
│  ├─ web/            # Next.js (App Router, PWA)
│  └─ api/            # NestJS
├─ packages/
│  ├─ shared/         # Zod schemas, enums (stages, roles, permissions), types
│  ├─ ui/             # shared shadcn-based components (optional)
│  └─ config/         # eslint, tsconfig, tailwind preset
└─ prisma/            # schema.prisma, migrations, seed
```

### NestJS modules
`auth` · `users` · `roles-permissions` · `teams` · `customers` · `projects` · `workflow` (state machine, transitions, SLA) · `quotations` · `boq` · `drawings` (soft + CAD, versioned) · `approvals` · `production` · `dispatch` · `installation` · `payments` · `service-tickets` · `documents` (storage) · `comments` · `notifications` · `dashboard` (aggregations) · `reports` · `audit` · `settings`

### Workflow engine (the core)
- Stages and allowed transitions are defined in **config/DB**, not hard-coded in controllers:
  `{ from: 'CAD_DRAWING', action: 'SUBMIT', to: 'HEAD_APPROVAL', role: 'cad', requires: ['cad_file'] }`
- A single `WorkflowService.transition(projectId, action, payload)` method:
  1. checks the permission and scope (CASL)
  2. checks the gates (required docs, checklist, payment)
  3. writes a `stage_transition` row, inside a DB transaction
  4. updates `project.currentStage`, assignee and SLA due date
  5. emits an event → notifications, audit, dashboard cache refresh
- An SLA check runs every 10 minutes (in-process scheduler with MySQL locks), flags due-soon and overdue stages and escalates them.

---

## 8. Data model (core tables)

```
users ─┬─ user_roles ── roles ── role_permissions ── permissions
       └─ team_id → teams (Sales, Project, Admin, CAD, Production, Dispatch, Service)

customers ── contacts
customers ── sites (address, city, geo)

projects (code UDH-YYYY-NNNN, customer_id, site_id, sales_owner_id, value,
          current_stage, status[active|on_hold|lost|completed|cancelled],
          stage_due_at, priority, created_at…)
  ├─ project_stages      (project_id, stage, assignee_id, started_at, due_at, completed_at, status)
  ├─ stage_transitions   (from, to, action, by_user, reason, created_at)   ← timeline
  ├─ documents           (type, version, file_key, uploaded_by, stage)      ← quotation/BOQ/drawing/CAD/photos/POD
  ├─ quotations          (version, amount, status, sent_at, decided_at, lost_reason)
  ├─ approvals           (type[customer_layout|head_cad], status, by, remarks)
  ├─ checklist_items     (stage, label, done_by, done_at)
  ├─ payments            (milestone, amount, due, received_at, mode, ref)
  ├─ production_items    (item, qty, status, progress, qc_passed)          [v2]
  ├─ dispatches          (trip_no, vehicle, driver, dc_no, delivered_at, pod_file) [v2]
  ├─ snags               (description, status, closed_at)                   [v2]
  ├─ comments            (body, mentions, author)
  └─ service_tickets     (priority, issue, assignee, warranty, status, csat) [v2]

notifications (user_id, type, payload, read_at)
audit_logs    (actor, entity, entity_id, action, before, after, ip, at)
settings      (stage SLAs, payment gate toggles, numbering)
```
Every table gets `created_at`, `updated_at`, `created_by` and soft delete (`deleted_at`). Index `projects(current_stage, status)`, `project_stages(due_at, status)` and `stage_transitions(project_id, created_at)`.

---

## 9. Security & non-functional requirements
- HTTPS everywhere, helmet, CORS allow-list, CSRF protection for cookie-based refresh
- Every API route is guarded; scope is enforced **in the query** (e.g. `where: { teamId }`), not only in the UI
- File access only through short-lived presigned URLs, after a permission check
- Full audit log; soft delete only (except Super Admin)
- Daily automated MySQL backups with 30-day retention and a restore test monthly
- Performance target: dashboard < 1.5 s on 4G; paginated lists; dashboard aggregates cached in memory (60 s)
- Hosting: Hostinger shared Node.js hosting, with web and API as two Node apps and MySQL from hPanel; no Docker, Redis or S3
- Logging and monitoring: pino logs, Sentry for errors, uptime monitor

---

## 10. Delivery phases (indicative)

| Phase | Duration | Scope |
|---|---|---|
| **0. Discovery & design** | 1–2 wks | Confirm stages, SLAs, roles and documents with the client; Figma for key mobile and desktop screens; finalize this plan |
| **1. MVP: core tracking** | 6–8 wks | Auth + RBAC (roles editable), teams, users, customers/sites, projects, **workflow engine for all 14 stages**, document uploads with versions, approvals and rejection loops, comments, in-app + email notifications, **Command Center dashboard**, My Queue, project detail with stepper, audit log, PWA |
| **2. Operations depth** | 5–6 wks | Payment milestones and gates, SLA escalations, production job cards + QC, dispatch planning + POD, snag list, service tickets + warranty, WhatsApp alerts, reports and exports |
| **3. Growth** | ongoing | Customer portal and online approvals, quotation/BOQ builder with catalogue, Tally/Zoho integration, AMC, inventory, advanced analytics |

Pilot: run Phase 1 with **2–3 live projects** alongside the current process for 2 weeks, then go fully live.

---

## 11. Questions to confirm with the client
1. Is the **Overall Head** the same person as the Super Admin (MD), or a separate approver? Can there be more than one?
2. Are **payment milestones** a hard gate (block production/dispatch) or only tracked?
3. Is the quotation made outside the system (Excel/Tally) and uploaded, or should the system generate it?
4. Does one project ever have **multiple sites or partial dispatches**?
5. Typical **SLA targets** for each stage?
6. Should **customers** get a tracking link or approval link (v3), or is the system internal only?
7. WhatsApp alerts: does the company already have a WhatsApp Business number?
8. Login preference for field staff: password, mobile OTP, or both?
9. Approximate number of users and active projects per month (for sizing)?
10. Any existing data (customer list, ongoing projects) to import?
