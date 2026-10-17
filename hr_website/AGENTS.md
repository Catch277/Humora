<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

Working rules for AI coding agents on the **Humora HR Website**.
`CLAUDE.md` imports this file (`@AGENTS.md`) — keep this the single source of truth and
don't duplicate the rules there.

## Project

Next.js 16 (App Router) + TypeScript admin web app for the HR & shift operations of a
coffee-chain: per-shift revenue declaration, staff-request approval, shift scheduling,
attendance, employee status, notifications, quick search and an AI policy/contract
assistant. The backend is Supabase (PostgreSQL + Auth + RLS) — there is no custom API
server, no ORM and no background worker in this app.

| Layer          | Where                                   | Rule                                                                                                   |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Route handlers | `app/api/**/route.ts`                   | HTTP only: parse, authenticate, call one use case, map errors to status codes. No queries, no rules.    |
| Use cases      | `lib/usecases/*UseCase.ts`              | Business rules; depend only on `lib/domain` interfaces passed into the constructor.                     |
| Domain         | `lib/domain/**`                         | Entities, repository/service interfaces, typed errors. Framework-free (no Next.js or Supabase imports). |
| Infrastructure | `lib/infrastructure/**`                 | Implements domain interfaces: Supabase repositories, the Gemini LLM service and the two reverse geocoders (`NominatimReverseGeocodingService`, `PhotonReverseGeocodingService`) behind `FallbackReverseGeocodingService`. |
| UI             | `app/<segment>/page.tsx`, `components/` | App Router pages, Vietnamese copy, Tailwind v4 + lucide-react.                                          |

## Repository context

The git repository root is the **parent** directory `D:\HR`, which holds three separate apps:

```text
D:\HR\                <- repository root: README.md, package.json and node_modules are committed here
├── hr_website\       <- THIS app. Run every command from this folder.
├── hr_mobile_app\    <- separate Flutter client (has its own AGENTS.md)
└── landing_website\  <- separate Next.js landing site (has its own AGENTS.md)
```

- Always work from `hr_website/`; installing or building at `D:\HR` picks up the wrong `package.json`.
- Paths printed by `git status` / `git diff` are repo-relative (`hr_website/lib/...`).
- Committed build output already exists at `hr_website/hr_website/.next/**` — leave it alone and never add more of it.

## Commands

Run from `hr_website/` with **npm** (the lockfile is `package-lock.json`).

| Task                        | Command                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| Install                     | `npm install`                                                                             |
| Dev server                  | `npm run dev` (http://localhost:3000)                                                      |
| Production build            | `npm run build`                                                                           |
| Lint                        | `npm run lint`                                                                            |
| Typecheck                   | `npx tsc --noEmit`                                                                        |
| Regenerate the OpenAPI spec | `npx tsx scripts/generate-swagger.ts` (also runs automatically via `predev` / `prebuild`)  |
| Apply schema SQL            | manually in Supabase Dashboard → SQL Editor (see "Data & Supabase")                        |

Before reporting work as complete, run `npx tsc --noEmit` (passes today) and lint the files you touched,
e.g. `npx eslint app/api/revenue/report/route.ts lib/usecases/GetRevenueReportUseCase.ts`.
Do **not** use a bare `npm run lint` as the gate: on a clean tree it reports ~6,512 problems
(1,088 errors, 5,424 warnings, exit 1) because the committed bundle output under
`hr_website/hr_website/.next/**` gets linted (only the root-anchored `.next/**` is ignored). No page or
route carries a lint error any more, so the count is not a quality signal about this app: untracked
dev-server output in that same folder can double it — run `git clean -f -- hr_website/hr_website` before
measuring. Don't fix unrelated findings and don't silence them — changing the ignore pattern is a
separate, approved task.
**There is no test runner in this repository** — never claim tests were run. Verify with the typecheck,
targeted lint, the endpoint or page you changed and `/api-docs`. Adding a test runner, CI or Docker is an
**ask first** change.

## Repo map

```text
hr_website/
├── app/                          # App Router
│   ├── api/_lib/requireCaller.ts # requireCaller() / requireCapability("…") — session + role gate (SCRUM-59)
│   ├── api/<resource>/route.ts   # Route handlers (thin controllers)
│   ├── api/<resource>/[id]/...   # Nested resources (requests/[id]/review, notifications/[id]/read)
│   ├── api/swagger/route.ts      # Serves the generated public/swagger.json
│   ├── api-docs/                 # Swagger UI page
│   ├── <segment>/page.tsx        # Screens: revenue, requests, shifts, attendance,
│   │                             #          employee-status, reports, notifications, chat,
│   │                             #          security (passkey sign-in, SCRUM-79)
│   ├── page.tsx                  # Dashboard
│   ├── layout.tsx                # Shell: Sidebar + Header + Be Vietnam Pro font
│   └── globals.css
├── components/                   # Header.tsx, Sidebar.tsx + MobileNav.tsx (phone drawer) + navigation.ts
│                                 #   (the one nav list) + OrganizationCard.tsx, LocaleProvider.tsx,
│                                 #   LanguageToggle.tsx, ThemeToggle.tsx, ProfileProvider.tsx,
│                                 #   LocationPickerMap*.tsx (Leaflet)
├── lib/
│   ├── i18n/                     # locales.ts (Locale, cookie, labels), messages/vi.ts + en.ts (the
│   │                             #   dictionaries; vi is the source), translate.ts (t() + interpolation)
│   ├── accessPolicy.ts           # Capability table + screen→capability map (SCRUM-59)
│   ├── domain/branchScope.ts     # canManageBranch() / defaultBranchId() — who may manage a branch (SCRUM-61)
│   ├── domain/entities/          # Plain interfaces (DB-backed fields stay snake_case)
│   ├── domain/errors/            # Typed error classes, one per case
│   ├── domain/repositories/      # I<Name>Repository / service interfaces
│   ├── domain/roles.ts           # OWNER / MANAGER / EMPLOYEE, normalizeRole() (CHU → MANAGER)
│   ├── usecases/                 # One class per business action + businessDay.ts helper
│   │                             # + branchScope.ts (assertBranchManagedBy / branchScopeOf, SCRUM-61/63)
│   ├── infrastructure/           # supabaseClient.ts, browserSupabaseClient.ts (passkeys, SCRUM-79),
│   │                             # Nominatim/Photon ReverseGeocodingService.ts + FallbackReverseGeocodingService.ts,
│   │                             # EdgeFunctionStaffProvisioningService.ts
│   ├── publicPaths.ts            # Screens rendered outside the shell (proxy.ts + Header/Sidebar)
│   ├── geo/vietnamOutline.ts     # Generated Vietnam land outline — never edit by hand
│   ├── geo/vietnam.ts            # isInsideVietnam() point-in-polygon + VIETNAM_BOUNDS envelope
│   └── swagger.ts                # OpenAPI definition + shared component schemas
├── scripts/generate-swagger.ts   # Builds public/swagger.json; exits 1 when no paths are found
├── scripts/ingest-knowledge.ts   # docs/*.md → chunks + embeddings → supabase/sql/knowledge_seed.sql
├── scripts/extract-vietnam-outline.mjs # Natural Earth 1:10m → lib/geo/vietnamOutline.ts (manual regen)
├── docs/                         # Source documents for the AI knowledge base (README.md is skipped)
├── supabase/sql/SCRUM-*.sql      # Idempotent schema/RLS/RPC scripts applied by hand
└── public/swagger.json           # Generated — never edit by hand
```

## Route handler recipe

Copy the shape of an existing Supabase-backed handler (`app/api/revenue/open/route.ts`) instead of
inventing one. Every route is Supabase-backed now — the in-memory mock store was deleted once the last
screen (employee status) moved to the `get_employee_status` RPC — so a new resource follows this recipe
end to end and adds its own `supabase/sql/SCRUM-*.sql` script. The reference implementations are
`app/api/branches/route.ts` (shared `_lib` parser, write path), `app/api/schedules/route.ts` (embedded
selects, `409` on a business conflict), `app/api/attendance/route.ts` (many filters, RPC-backed sibling
in `app/api/employee-status/route.ts`) and `app/api/users/[id]/route.ts` (role-gated update with the rules
that must not live in SQL).

1. Export `async function GET|POST|PUT|PATCH|DELETE(request: Request | NextRequest)` — default export
   is not allowed here. Respond only with `NextResponse.json(body, { status })`.
   When two handlers of the same resource validate the same body, share the parser from a private folder
   (`app/api/<resource>/_lib/<name>.ts` — `_folder` is opted out of routing) instead of duplicating it or
   pushing HTTP parsing into a use case. `app/api/branches/_lib/branchRequest.ts` is the reference.
2. Dynamic segments: `context: { params: Promise<{ id: string }> }`, then `const { id } = await context.params;`.
3. Parse the body with a local request type whose fields are `unknown`:
   `try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }`
4. Validate by hand — UUIDs against a module-level `UUID_PATTERN`, numbers with `Number.isFinite`,
   enums with a `Set` (`REPORT_PERIODS`), calendar dates with an explicit round-trip check. Return
   `400` with a message naming the offending fields. Never trust the payload, even for ids.
   An *optional* field is omitted **or `null`**, because screens clear them with `value || null`
   (`close_note: closeNote.trim() || null`): test it as
   `value === undefined || value === null || typeof value === "string"` — never as
   `value !== undefined && typeof value !== "string"`, which rejects `null` and turns the ordinary
   "left blank" case into a `400` (that is what made `PUT /api/revenue/close` fail whenever the note
   box was empty, while typing a note worked). `app/api/branches/_lib/branchRequest.ts` and
   `app/api/organizations/invites/route.ts` are the references.
5. Authenticate and authorize in one call: `const caller = await requireCapability("schedule:manage");`
   then `if (!caller.ok) return caller.response;` (`app/api/_lib/requireCaller.ts`) — it answers `401`
   without a session, `403` without a `users` row and `403` when the role does not hold that capability,
   which is the same table `proxy.ts`, the sidebar and the pages read (`lib/accessPolicy.ts`). Use the
   bare `requireCaller()` only for a route every signed-in member may call, and the raw
   `createSupabaseServerClient()` + `supabase.auth.getUser()` pair only when a route needs the session
   for something else (e.g. `GET /api/branches`). Ownership fields (`created_by`, `closed_by`,
   `approver_id`, `corrector_id`) always come from `caller.userId`, never from the body — and pass
   `caller.role` into a use case that re-checks the rule.
   A capability is the *first* of three layers, not the only one: the use case repeats the rule for the
   caller it is given and RLS (`is_organization_manager()` / `is_organization_owner()`, SCRUM-59/60) is
   what actually decides which rows exist.
6. Call exactly one use case: `await new ReviewRequestUseCase(new SupabaseRequestRepository()).execute({...})`,
   passing camelCase input.
7. Map failures: `instanceof` typed errors → `403`/`404`/`409`; anything else → `console.error("<action>", error)`
   and a generic `500` message. Never echo `error.message` or a stack trace from the catch-all branch.
8. Return `NextResponse.json(result)`; use `201` for created resources and shape-specific payloads
   (e.g. close revenue returns `{ revenue, revenue_difference }`).

## Code conventions

- Classes and interfaces: one per file, file named after the export, exported as a named export.
  `lib/` never uses default exports; `app/**/page.tsx`, `layout.tsx` and `components/` do, because Next.js requires it.
- Naming: use cases `XxxUseCase`, repositories `SupabaseXxxRepository implements IXxxRepository`,
  interfaces `IXxxRepository` / `ILLMService`, errors `XxxError` in `lib/domain/errors/`.
- Boundary naming: entities mirror DB columns in `snake_case` (`branch_id`, `created_at`, `is_read`);
  use-case inputs/params are `camelCase` (`branchId`, `closeAmount`). Repositories do the translation.
- Dependency injection through constructors only: `constructor(private readonly revenueRepository: IRevenueRepository)`.
  Infrastructure classes are instantiated in the route handler, never inside use cases or other infrastructure.
- Inject nondeterminism for repeatability: `private readonly now: () => Date = () => new Date()`
  (see `DeclareOpenRevenueUseCase`, `GetRevenueReportUseCase`).
- Domain errors extend `Error`, call `super("<message>")` and set `this.name = "<Class>"`.
  Repositories translate Supabase failures into them where the failure is expected (e.g. code `23505`
  → `RevenueAlreadyDeclaredError`); otherwise throw `new Error("<Verb> …: ${error.message}")`.
- No `any`. Narrow `unknown` with `typeof`/`in` checks; if a cast is unavoidable (Supabase RPC rows,
  `.data as T`), declare a local row type first and explain why in a comment. Supabase returns
  numeric columns as strings — coerce with `Number(...)` in the repository.
- `import type` for type-only imports; `async/await` only, no `.then()` chains; imports ordered
  `next/*` first, then `@/lib/...` (the `@/*` alias maps to the app root in `tsconfig.json`).
- Strict TypeScript is on (`strict: true`, `noEmit`); the build never emits JS from `tsc`.
- Comments explain *why* (timezone choice, RLS reasoning, generated-file warnings), not *what*.

## Data & Supabase

- Always get the client from `createSupabaseServerClient()` (`lib/infrastructure/supabaseClient.ts`).
  It is created per request from the App Router cookie store, so **RLS is the security boundary**:
  never add a service-role key, never build a second client, never bypass a policy in code.
- Repositories own every query. Select columns explicitly (never `*`), use `.maybeSingle()` when
  "no row" is a normal outcome, `.single()` when the row must exist, `.range()`/`{ count: "exact" }`
  for pagination, and throw on `error`.
- Aggregations and semantic search run through Supabase RPCs called from repositories:
  `get_revenue_report`, `get_employee_status`, `match_company_documents`, `match_user_contracts`.
  A reporting RPC must be `security invoker` (the default) so RLS still filters what the caller sees,
  and its date default must be computed in Asia/Bangkok, not from `current_date`.
- Schema, indexes, RLS policies, triggers and RPCs live as plain SQL in `supabase/sql/SCRUM-<n>_<name>.sql`
  and must be **run by hand** in Supabase Dashboard → SQL Editor (there is no migration runner or Supabase CLI here).
  New scripts are idempotent (`create table if not exists`, `drop policy if exists` before `create policy`),
  enable RLS and grant the narrowest policy. Never edit a script that has already been applied — add a new one.
- Tables in use: `users` (with `role` — `OWNER`/`MANAGER` can review requests, run the timesheet and the
  schedule, and manage the facilities and revenue, while only `OWNER` manages branches, staff accounts and
  the organization itself (SCRUM-59) — and
  `is_active`, false meaning the account left the company), `organizations` /
  `organization_join_codes` / `organization_invites` / `organization_join_attempts` (SCRUM-51: the
  tenant, its join code, the register of accounts that may spend that code, and the join audit trail),
  `requests`,
  `shifts` (**the shift template catalogue** — name + hours, written by SCRUM-30, seeded per organization by
  SCRUM-58 and read by quick search),
  `shift_assignments` (the schedule: one employee × one template × one `work_date`), `attendance` (the
  timesheet: one employee × one `work_date`, GPS point + distance, photo, complaint, verification),
  `facilities`, `daily_revenue`, `branches`, `notifications`, `notification_settings`, plus the chat
  document/contract tables.
- Business time is **Asia/Bangkok (UTC+7, no DST)** while timestamps are stored/served in UTC.
  Convert with `Intl.DateTimeFormat` + `Date.UTC(y, m - 1, d, -7)` (`lib/usecases/businessDay.ts`,
  `GetRevenueReportUseCase`). Do not "simplify" this to the server timezone.
- `lib/mock/adminStore.ts` was deleted with SCRUM-22: there is no demo data left, and every screen reads a
  table or an RPC. Do not reintroduce a mock store — a screen that has no table yet is a prototype that
  should say so in its own file, not a shared in-memory module.

## API documentation

- Every `app/api/**/route.ts` starts with a JSDoc `@swagger` block: path, method, `summary`, `tags`,
  `parameters`/`requestBody` and every `responses` entry. An endpoint without that block is undocumented.
- Shared schemas live in `lib/swagger.ts` (`components.schemas`) and are referenced with
  `$ref: '#/components/schemas/...'`; errors use `ErrorResponse`. Add new shared shapes there, not inline.
- `public/swagger.json` is generated by `scripts/generate-swagger.ts` (`failOnErrors: true`, exits `1`
  when zero paths are found, wired to `predev`/`prebuild`). Never hand-edit it — regenerate it.
- Consumers: `/api-docs` renders Swagger UI, `GET /api/swagger` returns the JSON spec.
- Revenue flows are tracked as `SCRUM-39` (open), `SCRUM-40` (close), `SCRUM-44` (report),
  `SCRUM-48` (notifications), `SCRUM-49` (quick search), the timesheet as `SCRUM-21` with review
  (corrections + khiếu nại) as `SCRUM-23`, staff administration as `SCRUM-24`, and the tenant model
  as `SCRUM-51` (organizations, join code, register, join RPCs), `SCRUM-52` (owner-created accounts
  through the `staff-account` Edge Function), `SCRUM-53` (organization scoping of the operational
  tables), `SCRUM-59` (the three-level role model: `CHU` → `MANAGER`, `is_organization_owner()`, the
  owner-only policies) and `SCRUM-60` (the per-role *read* scope) — cite the ticket in the code docs you
  touch. Branch management is ticket `SCRUM-61` (a chi nhánh trưởng only writes the branch they head,
  deleting a branch is owner-only and refuses while it still has data).

## Notifications

The inbox is a **read surface**; the database is its only producer (SCRUM-70/71/72).

- SCRUM-48 shipped the table, the API and the screen and **nothing ever wrote a row** — the table had no
  INSERT policy and no producer — which is why the bell read `0` on a healthy database. The writers now
  live in SQL: `SCRUM-70_notifications_fanout.sql` (the helpers and the one INSERT),
  `SCRUM-71_notifications_operation_events.sql` (doanh thu, đơn từ, xếp ca, chấm công) and
  `SCRUM-72_notifications_admin_events.sql` (nhân sự, chi nhánh, thiết bị, tổ chức).
- Triggers, not a use case, for the reason SCRUM-69 derived `worked_seconds` in the database: the app
  cannot insert another member's row (the request-scoped client is bound by `auth.uid() = user_id` and
  there is deliberately no service-role client), the mobile app writes `attendance` directly, and a
  trigger shares the statement's transaction — a rolled-back action leaves no phantom notification.
- `notify_user` / `notify_users` and every helper are `security definer` **and revoked** from
  `public, anon, authenticated`. Postgres grants EXECUTE to PUBLIC and PostgREST exposes `public`
  functions as RPCs, so without that revoke any member could forge a notification into somebody else's
  inbox. A new helper in this area needs the same `revoke`, and each script's verification query checks it.
- The vocabulary is split on purpose: a trigger stores a machine code in `notifications.type`
  (`REQUEST_CREATED`) and `lib/domain/notificationCatalog.ts` owns its label, its group and its screen.
  There is deliberately **no CHECK constraint** on `type` (the SCRUM-62 lesson) — an unknown code must
  render, not `500` the write that produced it. Add an event in *both* places.
- Audience by role (the full matrix is in the README): **EMPLOYEE** — ca được xếp/đổi/xoá/ngày nghỉ, đơn
  đã duyệt hoặc bị từ chối, giờ công được sửa/xác nhận, khiếu nại đã xử lý, và các thay đổi về chính tài
  khoản (vai trò, đã nghỉ, chi nhánh, mật khẩu tạm); **MANAGER** — đơn mới của chi nhánh mình, bất thường
  chấm công (đi muộn / ngoài vùng / về sớm / vào ca lại), khiếu nại, nhân sự vào hoặc rời chi nhánh mình;
  **OWNER** — doanh thu (kể cả lệch), đơn từ và quyết định của quản lý, nhân sự, chi nhánh, thiết bị, tổ chức.
- Attendance is **exception-only**: a manager whose bell rang for every check-in would stop reading it, and
  `/attendance` is where the whole timesheet lives. `notification_is_late` / `notification_is_early_leave`
  re-derive the verdict from `check_in_at` + the ca's hours (mirroring `CHECK_IN_GRACE_MINUTES = 5` through
  `attendance_grace_minutes()`), never from `attendance.status` — that column is what a *client* wrote.
- The `notifications` table here is the **hand-made** one: SCRUM-48's `create table if not exists` was a
  no-op and SCRUM-55 only gap-filled it, deliberately keeping the old message column `content`. That
  column was `NOT NULL`, and a fan-out INSERT fills `body` — so before SCRUM-74 every notification
  raised `23502` *inside an AFTER trigger*, which rolled the business statement back with it (creating
  or deleting a ca answered `500`, editing one that changed only a note still worked because that path
  returns before it notifies). `SCRUM-74_notifications_legacy_columns.sql` makes such a column nullable
  and re-reports any other mandatory-without-default column; never "fix" this by writing the legacy
  column from the trigger — the writer targets the SCRUM-48 shape, and the table is normalised instead.
  `SCRUM-76_notifications_never_break_business_writes.sql` is the generalised repair and **subsumes 74 and
  73** in one paste: it relaxes *every* mandatory-without-default column of that table (a dashboard edit
  can add another one, which is why only a loop can be complete), restates the guarded `notify_user`, and
  verifies with a real self-deleting insert. A `500 Unable to declare opening revenue.` (or
  `Unable to create the shift assignment.`) for a **manager** while the owner can do the same thing is this
  trap, not a permission problem: the write is rejected by `daily_revenue`'s AFTER trigger, so read the
  dev-terminal `Failed to declare opening revenue` line first and run `SCRUM-76` before touching RLS.
  The app cannot answer `403` here — nothing in the request is wrong — which is exactly why the operator
  needs the log line and the script, not a "silently matched no row" policy.
- A notification must never be able to break the write that produced it: `notify_user` catches its own
  INSERT failure (SCRUM-73), because PL/pgSQL's implicit savepoint rolls the notification back alone
  while the shift assignment, the revenue close or the đơn still commits. The loss is reported as
  `notify_user: could not store …` in the Postgres log — follow it rather than assuming the inbox is
  simply quiet. `SCRUM-73` also widens the amount label so no `numeric(14,2)` figure can make `to_char`
  raise inside a trigger.
- Nobody is told about their own click: every fan-out removes the actor (`without_user`), which is why an
  employee who has just filed a đơn receives nothing for it — they hear about it when it is duyệt/từ
  chối (`REQUEST_APPROVED`/`REQUEST_REJECTED`). The second reason a specific account receives nothing is
  its own settings row: `notification_settings.channel = 'in_app', enabled = false` makes `notify_user`
  skip it before the INSERT, and the old drawer's "off by default" rendering made that easy to save by
  accident (the drawer now warns about it in amber). "The bell stays empty while the operation
  succeeded" is therefore a fan-out failure and a Postgres log warning, never a UI problem.
- `notification_settings.channel = 'in_app'` is the master switch the fan-out honours, and **no row means
  enabled**; the drawer's default must match it (`mergeChannels`). `email` / `push` are switches without a
  delivery service behind them and the drawer says so instead of implying otherwise. A per-category mute
  (SCRUM-73) is the additive follow-up: `NOTIFICATION_CATEGORIES` and the gate inside `notify_user` are
  where it plugs in.
- The reader: `GET /api/notifications` filters **server-side** (`unread`, `read`, `type=a,b,c`),
  `POST /api/notifications/read-all` marks the inbox in one statement, and both `/notifications` and the
  header bell poll every 30 s. Never reintroduce a client-side filter over the loaded page — it makes the
  counters and the pagination lie about what the user sees.
- Deploy order: `SCRUM-70` → `SCRUM-71` → `SCRUM-72`, before or together with the build. No column of a
  table the app already selects is added, so there is no `42703` risk and no app-side order dependency —
  unlike SCRUM-68/69.

## Password reset by email (forgot password)

`/login` has a "Quên mật khẩu?" panel and `/reset-password` is where the emailed link lands. The flow
is three route handlers plus one shell-less screen, and it is the one auth flow that needs a **Dashboard
setting**:

- `POST /api/auth/forgot-password` asks Supabase Auth for the recovery mail
  (`resetPasswordForEmail`). The answer is identical whether or not the address has an account —
  Supabase behaves that way on purpose, and restating it here would make the endpoint a way to
  enumerate the organization's staff. The only failure it names is `429` (Supabase rate-limits the
  recovery mail per address).
- The mail's link returns to `GET /api/auth/recovery`, which exchanges the one-time `code` for a
  recovery session and redirects to `/reset-password`; an unusable link lands on
  `/login?recovery=failed`, which explains itself.
- **Prerequisite:** Supabase Dashboard → Authentication → URL Configuration → Redirect URLs must list
  `{origin}/api/auth/recovery` (the deployed domain **and** `http://localhost:3000/api/auth/recovery`).
  Without it GoTrue refuses the `redirect_to` and the endpoint answers `500` — read the dev-terminal
  `Failed to send the password reset email` line, which carries GoTrue's own sentence.
  Email delivery uses the project's SMTP settings (the built-in one is fine for dev).
- **`@supabase/ssr` pins `flowType: "pkce"` for both of its clients**, so the link carries `code` (not
  the old `#access_token` fragment) and the exchange needs the PKCE verifier — a cookie stored by the
  browser that *asked* for the mail. The link therefore completes only in that same browser; a link
  opened elsewhere is refused rather than half-working. The verifier is why the recovery handler builds
  its own client and writes the session cookies onto the redirect it returns (the `proxy.ts` shape):
  `cookies().set()` lands on the response Next would otherwise have produced.
- `/reset-password` is in `SHELL_LESS_PATHS`, not `PUBLIC_PATHS`: by the time it renders the session
  already exists, and `proxy.ts` sends a signed-in visitor away from a public path. It saves the new
  password through the existing `POST /api/auth/change-password`, so there is no second write path.
- The show/hide toggle on every password field is `components/PasswordInput.tsx`; it flips the input's
  `type` instead of re-rendering the value as text, so a password manager and the mobile keyboard still
  see a password field. Copy is `common.showPassword` / `common.hidePassword`.

## Sign-in security: passkeys / Face ID (SCRUM-79)

`/security` is how an account turns "Face ID quick login" on for the device it is using, and it is the one
screen that talks to Supabase Auth directly instead of through `app/api/**`.

- **Nothing biometric is stored in this app.** A passkey is a WebAuthn credential: the private key stays on
  the device behind Face ID / Windows Hello / a fingerprint, Supabase Auth keeps only its public half, and
  there is no template, photo or new table anywhere. `/security` registers, renames and deletes them
  (`auth.passkey.*`); the credential lives in `auth.*`, which is why this feature needs **no SQL script at
  all** — and why the passkey guide's `passkey_disabled` machine codes matter more than a policy.
- **One browser client, and only where the ceremony must run:**
  `lib/infrastructure/browserSupabaseClient.ts` (`createBrowserClient`). `navigator.credentials.create()` /
  `.get()` do not exist on a server, so registration (`/security`) and sign-in (`/login`) cannot be route
  handlers. It writes the same auth cookies `createServerClient()` reads, so `proxy.ts`, `requireCaller()`
  and RLS are unchanged — but never give it a service-role key, `auth.storage` or a second session: it
  shares the *server* client's cookie jar, it does not replace it.
- **`/login` keeps both doors open:** "Đăng nhập bằng Face ID" (`signInWithPasskey()`) sits under the
  password form, which stays the fallback — a lost device must never lock an account out. Every passkey
  call is scoped to the caller by GoTrue, so there is no row for a use case or RLS to decide; the only
  app-side rule is the capability `security:manage`, held by all three roles (a passkey belongs to the
  account, not to a job — see `EMPLOYEE_CAPABILITIES`).
- **Every failure has one sentence, in `lib/domain/passkeyMessages.ts`**: `passkey_disabled`,
  `webauthn_credential_exists`, the `ERROR_*` codes of the WebAuthn spec and the browser's own
  `NotAllowedError`, matched structurally through `error.code` / `error.name` so `lib/domain` keeps
  importing neither Supabase nor Next.js. Add a new code there, never in a page.
- **Prerequisites, or the button does nothing:** Supabase Dashboard → Authentication → Passkeys (enable +
  Relying Party display name + **RP ID = the deployed bare domain**, `localhost` for dev) and **HTTPS** in
  production — WebAuthn has no secure-context fallback, so an IP-address host cannot work at all. Passkeys
  are **experimental** in Supabase and **per device**: enrolling a phone does not enable a desktop.
- **The capability probe is advisory, never a gate:** `isUserVerifyingPlatformAuthenticatorAvailable()`
  only colours a hint on `/security` — it answers `false` on any machine without Windows Hello or a
  reachable Touch ID (a desktop, an external keyboard or monitor, clamshell, Remote Desktop, some VMs) and
  wherever the browser simply cannot tell, while a **phone (the QR hand-off) or a security key can still
  complete the ceremony**. Disabling the button on that answer hid a working path once; do not do it again.
  `PublicKeyCredential` missing is the only real stop (WebAuthn is a `[SecureContext]` API, so plain HTTP,
  an old browser or an in-app/preview webview), and even that is a sentence, not a disabled button. While a
  hint is up the screen also prints `Chẩn đoán: máy · HTTPS · WebAuthn · Face ID / Windows Hello`, so the
  operator can report the cause without opening DevTools.
- **State inside an effect:** React 19's `react-hooks/set-state-in-effect` fails the lint on a `setState`
  called synchronously in an effect body, so a screen loads data through the promise callbacks
  (`components/Sidebar.tsx` is the reference) and asks about browser capabilities at press time instead.
  A page may therefore keep one `.then()` chain; `lib/` stays `async/await`-only.
- **Not shipped yet:** requiring a fresh Face ID assertion before check-in is the planned SCRUM-80. The
  evidence for it (`aal` / `amr` in the session JWT) is already reachable from a route handler through
  `requireCaller().accessToken`; nothing enforces it today.

## UI & i18n conventions

- New screens are `app/<segment>/page.tsx`; register them in `components/Sidebar.tsx` (lucide-react icon
  + Vietnamese label) so navigation stays complete (add it to `SHELL_LESS_PATHS` in
  `lib/publicPaths.ts` instead when it must render without the navigation, as `/onboarding` and
  `/change-password` do). A screen that is a one-off setup step rather than a daily destination belongs
  in neither list: `/organization` is reached from onboarding and from the organization card in the
  sidebar footer, and `proxy.ts` redirects an account without an organization to `/onboarding`, so the
  card link serves the owner and the newcomer alike. `app/layout.tsx` owns the shell and the
  Be Vietnam Pro font; only add `"use client"` when state, effects or browser APIs are used.
- Tailwind CSS v4 (no `tailwind.config.*`; the PostCSS plugin is `@tailwindcss/postcss`). Reuse the
  existing visual language: primary `#0C66E4` with `blue-50` tints, surfaces `#F8F9FF`/`#F3F6FC`,
  `rounded-xl`/`rounded-2xl`, `border-slate-200/80`, small uppercase section labels, `lucide-react` icons.
- **Responsive rules — a phone is a supported target, not an afterthought.** `md` (768px) is the single
  breakpoint. `components/navigation.ts` is the **only** navigation list: `Sidebar` renders it from `md` up
  and `components/MobileNav.tsx` renders the same list as a drawer below it (hamburger in the header, a
  `fixed` panel with `role="dialog"`, closing on backdrop/✕/Escape/route change/`md`, page scroll locked
  while open) — never add a link to one of the two. Below `md` the shell scrolls as a document
  (`min-h-dvh`, `app/layout.tsx`) because iOS Safari overlays the keyboard without resizing the layout
  viewport, while from `md` up it keeps the `h-dvh` frame. `app/globals.css` forces 16px on
  `input/select/textarea` under 768px — deliberately outside every `@layer`, so it outranks Tailwind's
  `text-xs`/`text-sm` — which is what stops Safari zooming the page on focus. No hover-only affordance
  (`opacity-0 group-hover:opacity-100` is invisible *and* the button is still tappable on touch: gate it
  with `md:` instead), dialogs cap at `max-h-[85dvh]` and are `items-end sm:items-center` with
  `p-4 sm:p-6`, and a control a thumb must hit is ≥ ~40px. A table cell whose content must not break (a
  status pill, a date, a badge) needs `whitespace-nowrap`, headers included — a `Chờ vào tổ chức` pill
  wrapped over three lines on `/organization` at 393px before it was added. The reasoning lives in
  `DESIGN.md` §4.4.
- **Never write a literal hex in a component.** Use the semantic tokens from `app/globals.css`:
  `bg-surface` (panels — replaced every `bg-white`), `bg-app` (page canvas), `bg-surface-muted`,
  `bg-canvas`, `bg-primary` / `text-primary` / `border-primary` / `hover:bg-primary-strong`. They resolve
  per theme, which is what makes the dark mode work; a hex cannot. Need a new colour? Add a token, and
  remember `--color-white` is shared by `bg-surface` and `text-white`, so it is never re-pointed.
- Theme: `components/ThemeToggle.tsx` (Sáng / Tối / Theo hệ thống) writes `localStorage["humora-theme"]`
  and toggles `.dark` on `<html>`; `app/layout.tsx` applies it before first paint with an inline script
  (keep `suppressHydrationWarning` on `<html>`), and `.dark` re-points Tailwind's palette variables so
  screens need no `dark:` variants. Use `dark:` only for a genuine exception (e.g. the Swagger UI frame).
- Numbers and dates go through `lib/i18n/format.ts` (`formatCurrency`, `formatNumber`, `formatDateTime`,
  `formatTime`, `formatDayMonth`, `weekdayShort`, …) instead of a new `new Intl.NumberFormat("vi-VN")` in a
  screen: the reader's locale decides the grouping, `Asia/Bangkok` decides the zone. English formats as
  **`en-GB`** on purpose — dates stay day-first and the clock 24-hour, as the Vietnamese screens write them.
- Every screen is Supabase-backed: `/` (Tổng quan), `/revenue`, `/reports`, `/notifications` and `/chat`
  (Trợ lý AI → `POST /api/chat/ask`) all fetch `/api/*`, and so do the two header widgets — the search box
  (`GET /api/search`) and the bell badge (`GET /api/notifications?unread=true&page_size=1`, where `total`
  is the unread count). `/chat` is stateless — the endpoint takes one question and answers
  `{ answer, sources }` — so the conversation lives in component state and the screen must not invent a
  history, a confidence score or a step list. Wire a page to `/api/*` with real data when a task calls for
  it, and preserve the existing layout and loading/empty states.
- Language: code, identifiers and English-style comments stay in English. The Chat AI module
  (`ChatAnswerUseCase`, `GeminiLLMService`, `lib/domain/entities/ChatMessage.ts` and the `@swagger` text of
  `/api/chat/ask`) is documented in Vietnamese — keep that module consistent. **Every sentence a caller can
  see is Vietnamese** — route payloads, domain errors, the Edge Function's answers — because the screen often
  shows that text verbatim and the app is Vietnamese-first. `console.error` / repository diagnostics
  (`Unable to load …: ${error.message}`) stay English on purpose: they sit in the log next to Postgres' own
  English text and never reach a caller. `@swagger` prose keeps its mixed wording (developer documentation,
  not UI). A route that picks a status by matching a message must match a token that survives translation —
  a field name (`startsWith("status")`) or the Vietnamese phrase — and both sides change together; see §8 of
  `DESIGN.md` and `app/api/organizations/_lib/organizationErrorResponse.ts`.
- **Locale (vi / en).** Copy lives in `lib/i18n/messages/vi.ts` (source) and `messages/en.ts`, both typed
  `Record<MessageKey, string>`, so a key missing on either side fails `npx tsc --noEmit`. A component reads it
  through `const { t } = useLocale()` (`components/LocaleProvider.tsx`) — never a hard-coded string in new
  code, and never a label stored in `components/navigation.ts` (it carries a `labelKey`). The locale is the
  `humora-locale` cookie, read by `app/layout.tsx` on the server for `<html lang>`; `components/LanguageToggle.tsx`
  switches it. Un-migrated screens keep their Vietnamese literals and are migrated one at a time — never in a
  mass sweep. `/organization` is the reference screen for a full migration: its copy, **including its
  module-level `accountErrorMessage` / `actionErrorMessage` / `provisioningNote` helpers** (they take
  `t: Translate` as their last argument, because a helper outside the component has no hook), lives under the
  `organization.*` keys, and its `formatDateTime` takes the locale so the date *style* follows the reader
  while the `Asia/Bangkok` time zone does not. Two traps a scripted pass must respect: a literal used as an
  attribute value (`aria-label="…"`) needs `={t("…")}`, and a line of JSX copy needs its own indentation and
  braces (`{t("…")}`) — a bare `t(…)` in a text position does not compile. A screen is picked clean when
  `node scripts/tmp-lines.mjs app/<segment>/page.tsx` (a throwaway helper, deleted when the pass ends)
  reports no Vietnamese line at all.
- **Shared labels.** A vocabulary several screens render carries a **dictionary key**, never a string:
  `lib/i18n/labels.ts` (`attendanceStatusLabel`, `shiftAssignmentStatusLabel`, `employeeStatusLabel`,
  `requestStatusLabel`, `requestTypeLabel`), `roleLabel(role, t)` (`lib/accessPolicy.ts`),
  `notificationTypeLabel(type, t)` / `notificationCategoryLabel(category, t)`
  (`lib/domain/notificationCatalog.ts`) and `passkeyErrorMessage(error, t)`
  (`lib/domain/passkeyMessages.ts`). Each takes `t` as its **last, optional** argument and defaults to
  `translateVi` (`lib/i18n/translate.ts`, the source locale), so a call site renders exactly what it rendered
  before until its screen passes `useLocale().t`; a code no vocabulary knows renders itself rather than a
  blank pill; and the vocabularies whose stored value *is* the label (`requests.request_type`) are translated
  for **display only** — what a screen sends stays the stored value. A screen's own `STATUS_LABELS` table is
  deleted when that screen is migrated, not kept next to the key.
- **A public screen carries the switch itself.** `Sidebar` and `Header` return `null` for a path in
  `PUBLIC_PATHS`, so `/login` and `/register` render `LanguageToggle` inside their own card — otherwise a
  visitor who has never signed in could not reach English at all. Every other screen (including the
  shell-less `/onboarding` and `/change-password`) gets it from the header.

## Boundaries

**Never, without being asked:**

- Commit `.env.local` or any secret, real staff data or salary figures. Required variables (gitignored,
  and there is no `.env.example` yet): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `GEMINI_API_KEY`.
- Edit generated output: `public/swagger.json`, `next-env.d.ts`, anything under `.next/`.
- Add more tracked build output (the repo already contains junk at `hr_website/hr_website/.next/**`).
- Modify a `supabase/sql/*.sql` script that has already been applied — add a new one.
- Change a route's response shape, status codes or error wording that existing UI code consumes.
- Run `git push --force`, `git reset --hard`, `git checkout -- .`, or otherwise rewrite history or
  discard uncommitted work.
- Weaken or bypass RLS, or swap the request-scoped Supabase client for an admin/service-role client. The
  single privileged path is the `staff-account` Edge Function: it authorizes the *caller's* JWT, requires
  `OWNER` of an organization, and its service-role key stays in Supabase's own secrets — never in
  this app, its env files or a client bundle.
- Remove or downgrade lint/type checks (or add ignores) to make something pass.
- Touch the sibling apps `hr_mobile_app/` and `landing_website/` from here.

**Ask first:**

- Adding, upgrading or removing a dependency (including a test runner, state library or UI kit).
- Changing CI, Docker, deployment or build configuration — none exists yet, so this is a design decision.
- Anything touching auth, sessions, RLS policies, PII, payroll or salary data.
- Changing the Gemini models, prompts or API usage in `GeminiLLMService` (costs money and changes answers).

## Git & PRs

- The repository root is `D:\HR`; branch from `main` using `feat/…`, `fix/…` or `chore/…`.
- Conventional commits (`feat(api): add revenue report filters`), one logical change per commit,
  diffs kept reviewable (roughly under ~400 lines).
- Mention the SCRUM ticket (`SCRUM-44`) in the commit or PR when the work maps to one.
- PR description: what changed, why, and how you verified it (commands run, endpoints and pages checked).
- Stage only files this task touched: `git status` is repo-root relative, and unrelated churn in
  sibling apps must not be part of the change.

## Gotchas

- `npm run dev` and `npm run build` first run `scripts/generate-swagger.ts`; a broken `@swagger` block
  makes the script exit `1` and the dev server or build never starts.
- Missing env vars fail at runtime with a thrown error (`createSupabaseServerClient`, `GeminiLLMService`),
  not at build time — a page that throws "Missing NEXT_PUBLIC_SUPABASE_URL…" means `.env.local` is absent.
- `npm run build` may need outbound access to `fonts.googleapis.com` (Be Vietnam Pro via `next/font/google`).
- `next dev` re-adds the managed block at the top of this file; keep it, or every run leaves a dirty diff.
- Turbopack is pinned to the app folder via `root: process.cwd()` in `next.config.ts` — the parent
  `D:\HR` also has a `package.json`/`node_modules`, so don't remove that setting.
- `npm run lint` is currently red for reasons unrelated to any single task (see "Commands"): the
  committed bundles under `hr_website/hr_website/.next/**` are linted. Scope lint to the files you
  changed; changing the ignore pattern needs approval.
- Supabase numeric columns come back as strings; repositories coerce with `Number(...)`.
- RLS decides visibility, so the same query returns different rows per session — check the policies in
  `supabase/sql/*.sql` before debugging an "empty" or "not found" result, and remember RPCs must respect
  `auth.uid()`.
- A missing `users` row for a signed-in account is a `403` (see `/api/search`), not a `401` — `401` means
  no session at all. `users.role` gates approvals (`OWNER`/`MANAGER` through `request:review` in
`ReviewRequestUseCase`), and
  `PATCH /api/requests/[id]/review` now runs on the real `requests` table: the route reads the role from
  the session's profile, the use case rejects other roles and the `requests_update_managers` policy
  (SCRUM-41) repeats that check in the database. Never go back to trusting a role sent in the body.
- Dates: store and serve UTC (`toISOString()`), compute business days in `Asia/Bangkok` — the unique index
  on `daily_revenue` also uses the Bangkok date, so a "duplicate" 409 can come from the database, not the use case.
- `public.users` has **no script of its own** — it was hand-created in the dashboard before any ticket, which
  is why `SCRUM-50_user_registration.sql` only fills the gaps (`create table if not exists` + `add column if
  not exists`) and why nothing but that trigger creates the profile row for a new auth account. Add a public
  screen (like `/register`) by extending `lib/publicPaths.ts`; `proxy.ts`, `Header` and `Sidebar` all read it.
  SCRUM-50 also created the narrow `users_select_own` read policy; `SCRUM-24_staff_admin.sql` replaced it with
  `users_select_authenticated` (the staff directory) and added `users_update_managers`, so that is where the
  read and write rules live now.
- `public.notifications`, `public.notification_settings` and `public.requests` were hand-made the same way, so
  `SCRUM-48` and `SCRUM-41` — both written with `create table if not exists` — never added what they declare:
  `notifications` had `content` instead of `body` and neither `related_entity_*` column, `notification_settings`
  had no `id`, and `requests` had no `requests_user_id_fkey`. `SCRUM-55_schema_gap_fill.sql` is the gap-fill
  (columns, the `content` → `body` copy, the key, the FK, and SCRUM-48's indexes/trigger/policies restated
  idempotently). A 500 from `/api/notifications`, `/api/notifications/settings` or `/api/requests` almost
  always means it has not been applied yet.
- The same trap has a *second* layer, and the two scripts that repair it are complementary:
  `SCRUM-77_notification_tables_write_path.sql` restores the **declared defaults** a hand-made table never
  received — `notification_settings.updated_at` (declared `default now()`, set only by the `before update`
  trigger, which does not run on INSERT) and `notifications.type` / `is_read` / `created_at` — while
  `SCRUM-76` covers the columns the writer fills. A drawer that cannot save for **every** role
  (`500 Unable to update notification settings.`) is that missing default, never a permission: the upsert is
  the caller's own row, so `auth.uid() = user_id` is satisfied for all three roles. §5 of `SCRUM-77`
  also compares what the drawer stored against what `notification_in_app_enabled()` answers, because a
  `security definer` gate whose owner is not the table's owner reads nothing and then answers `true` for
  every recipient — the mute would silently stop working. Note `SCRUM-74` §5's report excludes
  `updated_at`/`created_at` (as columns "every writer supplies"), which is exactly why this one was invisible.
- When a screen answers 500 and the route logs a generic message, the database speaks plainly through
  PostgREST: `GET {NEXT_PUBLIC_SUPABASE_URL}/rest/v1/<table>?select=<column>&limit=1` with the anon key answers
  `42703 column ... does not exist` for a missing column and `PGRST200 Could not find a relationship ...` for
  a missing foreign key (RLS hides rows, not the error). That is how the SCRUM-55 gaps were found — the
  `latest` browser session is not needed, and nothing sensitive is returned.
- `public.shifts` is a shift **template** ("Ca sáng", 08:00–17:00) and `public.shift_assignments` is the
  schedule — do not merge them. Overlap detection lives in the use case
  (`lib/usecases/shiftOverlap.ts`) because only it can compare the hours of two templates; the database only
  guards the exact duplicate with a unique index on `(employee_id, work_date, shift_id)`.
- The shift catalogue is **per organization** (SCRUM-53 put `organization_id = current_organization_id()`
  into `shifts_select_authenticated`), while SCRUM-30's four seeds were written before the column existed,
  so they carry `organization_id = null` and are invisible to every signed-in member. That is why the
  "Ca làm việc" picker on `/schedules` could be empty while the screen was healthy: reading worked, there
  was nothing to read. `supabase/sql/SCRUM-58_shift_catalogue.sql` adopts those legacy rows when the project
  has exactly one organization, seeds the standard names for every organization that is missing one and adds
  an `after insert` trigger on `public.organizations` so a new tenant is seeded on creation — nothing in the
  app can insert a template (`shifts` has a SELECT policy only), so the database is the only owner of the
  catalogue.
- `/schedules` picks the employee from the SCRUM-24 directory (`GET /api/users`), not from `/api/search`:
  the picker needs `is_active` to leave out the accounts that have quit, and the directory already holds the
  name, role and that flag. A non-manager gets `403` from the directory and reads "chỉ chủ sở hữu/quản lý
  mới xem được danh sách nhân sự" — acceptable, because `shift_assignments_insert_managers` lets only
  `OWNER`/`MANAGER` write a shift at all. The exclusion is deliberately a **UI** rule: somebody deactivated after
  being scheduled keeps their assignment (it stays editable and is shown with `(đã nghỉ)`), so a blanket
  check inside `CreateShiftAssignmentUseCase` would break that legitimate edit. SCRUM-63 narrows the same
  picker twice more, and both remain **screen** rules: only an `EMPLOYEE` is offered (a ca is covered by
  staff, never by a manager or the owner — `isEmployeeRole`), and a manager sees only the people whose
  `users.branch_id` is one of the branches they head (`manageableIds`), because an employee of another
  branch belongs to somebody else's roster. The tab itself is scoped the same way: its branch filter, its
  modal picker *and* the week table with its counters come from the branches the caller heads (`scopedBranches`
  and `visibleAssignments`), so a KPI never promises a number the list does not show. RLS is unchanged — a
  manager may still read the whole organization (SCRUM-60); this is the screen saying which part of it the
  schedule tab is about. That scope is applied **only to a manager** (`scopesByBranch`): an `EMPLOYEE`
  heads no branch, so filtering by `manageableIds` used to blank their own week — they keep what
  `GET /api/schedules` returned, which RLS already narrowed to their own rows.
  - The screen builds its `BranchViewer` with `viewerFromRole(profile?.role, profile?.id)` — the same
    function the use cases call — and never infers "the owner" from a capability. It used to read
    `can("branch:manage")`, which is a *branch-administration* capability standing in for a role: on a
    half-loaded profile (or if that capability ever changes) the schedule silently fell into the
    branch-scoped path, so an owner saw an empty week table and no Sửa/Xoá buttons at all.
  - `manageableIds` comes from `GET /api/branches`, so that request's failure must be **visible**: a
    swallowed one empties the scope, hides every row action and disables "Xếp ca" in the modal — the
    symptom is indistinguishable from a permission problem. `LoadResult.error` says which of the two
    requests failed (`Không thể tải danh sách chi nhánh…`).
  - An employee whose `users.branch_id` is still `null` cannot be scheduled (a ca in a branch they do
    not belong to would be invisible to them), and only the owner may set that column — so the owner
    gets an inline "Gán chi nhánh" (a `PATCH /api/users/{id}` carrying the account's current
    `role`/`is_active`, because that endpoint replaces the record) beside the message instead of being
    sent to `/staff` and back. A manager sees the sentence alone, as before.
- `/schedules` renders the week as a **table** — one row per ca of the catalogue (earliest first, the
  zero-length `Nghỉ` template last), seven day columns, and one block per assignment inside a cell — not as
  the stacked day sections SCRUM-30 shipped. `compareShiftsByStartTime` in the page is the single copy of
  the ordering rule and the modal's "Ca làm việc" picker reads it too; `GET /api/shifts` keeps `name asc`
  for its other consumers, because PostgREST cannot express "zero-length last". The rows are the catalogue
  *plus* the templates embedded in the visible assignments, so a template deleted since a ca was written —
  or a failed `/api/shifts` — cannot make work disappear, and a week with no rows at all says the catalogue
  is missing (`SCRUM-58_shift_catalogue.sql`) instead of showing an empty frame.
- Embedded PostgREST selects (`employee:users (id, full_name)`) defeat the client's type inference: `data`
  comes back as `GenericStringError`, so those casts go through `unknown` and the row type is normalised in
  the repository. A to-one embedding can also arrive as an array, so normalise with a `firstOf` helper.
- An embed must **name its foreign key** whenever the target table is reachable twice:
  `employee:users!attendance_employee_id_fkey (id, full_name)`. `attendance` (employee + verifier +
  corrector), `shift_assignments` (employee + creator), `requests` (requester + approver) and the records
  tables all point at `users` more than once, and PostgREST answers `PGRST201` ("more than one relationship
  was found") instead of guessing — a 500 on an otherwise healthy screen. Add a third FK to a table and every
  unqualified embed into it breaks at runtime, not at compile time.
- The tenant model (SCRUM-51/53) lives in RLS and `security definer` RPCs, not in application logic:
  `join_organization` demands **both** the right code *and* a register row for the caller's email (so a
  leaked or guessed code is useless to an outsider), `create_organization` is what makes somebody an
  `OWNER` — registering grants nothing — and every operational table carries `organization_id` whose
  column default is `current_organization_id()` (that is why the mobile check-in needed no change).
  `proxy.ts` owns the two onboarding redirects (`/onboarding` while the account has no organization,
  `/change-password` while `must_change_password` is set) and skips them when the `users` row or those
  columns are missing, so a half-applied database cannot lock everyone out.
- The two policy helpers — `public.current_organization_id()` and `public.is_organization_manager()` —
  must stay **`security definer`** (SCRUM-54). Both read `public.users`, and the `users` policies call
  them, so as invoker functions the policy re-enters itself on the inner read and every profile read
  fails with `stack depth limit exceeded`; the same error silently disables the `/onboarding` redirect,
  which is what makes the organization feature look missing after login. Never "simplify" them back to
  invoker, and never inline a `select … from public.users` into a policy on `users`.
  `public.is_organization_owner()` (SCRUM-59) is the third one and follows the same rule.
- The three-level role model (SCRUM-59/60) is one table in the app and one set of policies in the database,
  and they must agree:
  - `lib/domain/roles.ts` owns the vocabulary (`OWNER`/`MANAGER`/`EMPLOYEE`, `normalizeRole` mapping the
    legacy `CHU` → `MANAGER`) and `lib/accessPolicy.ts` owns the capability table plus the
    screen→capability map. Compare roles only through those two files — never `role === "CHU"`.
  - `requireCapability("…")` (`app/api/_lib/requireCaller.ts`) is what a route handler starts with, and
    `useProfile().can("…")` (`components/ProfileProvider.tsx`) is what hides a control the role may not
    use. Adding a screen means adding its capability to `SCREEN_ACCESS` (`proxy.ts` bounces a deep link
    and `Sidebar` filters the link with the same row) and a page whose buttons a lower role may not press
    has to hide them — a `403` a click away is a bug in the page, not a feature.
  - The middle level is `MANAGER`; `CHU` survives only as an alias in `normalizeRole` and in the
    pre-SCRUM-59 SQL scripts (never edit an applied script — the rename lives in `SCRUM-59_role_model.sql`).
  - Deploy order is `SCRUM-59` → app **and** the redeployed `staff-account` Edge Function (its
    `INVITE_ROLES` and owner check used to spell `CHU`) → `SCRUM-60`, because `SCRUM-60` narrows reads that
    an older bundle would still be querying → `SCRUM-61` together with the build that ships it, since the
    branch scope only makes writes stricter.
- The branch scope (SCRUM-61) is the third axis of the role model, and it lives in the same three places:
  the capability table, the use cases and RLS.
  - `lib/domain/branchScope.ts` is the only copy of the rule — `canManageBranch(branch, viewer)` (the
    organization's `OWNER`, or the account named in `branches.manager_id`) plus `defaultBranchId()` for the
    screens — and `assertBranchManagedBy(repository, branchId, caller)`
    (`lib/usecases/branchScope.ts`) is what a use case calls. Never re-implement the comparison
    (`branch.manager_id === caller.userId`) in a route or a page: the two would drift.
  - The guard answers `403` (another branch) or `404` (unknown branch) *before* the write, so RLS never has
    to express the rule as "silently matched no row", which the caller would read as "not found".
  - Write policies ask `public.heads_branch(branch_id)` instead of `is_organization_manager()` — on
    `branches`, `daily_revenue`, `shift_assignments`, `attendance`, `facilities` and `requests` — so a
    manager who heads no branch writes nothing while still *reading* the organization (SCRUM-60). The
    helper must stay `security definer`: it reads `branches` from a policy on `branches`, which as an
    invoker function re-enters itself.
  - A branch head is a `MANAGER` and nothing else (SCRUM-63 narrowed the SCRUM-61 rule): the picker on
    `/branches` filters the directory through `isBranchHeadRole`, and `assertBranchManagerExists` answers `400`
    (`BranchManagerRoleError`) for an employee *and for the organization's owner* — the owner stands above
    every branch instead of running one. `heads_branch()` still accepts an owner so a legacy `manager_id`
    keeps working, but it grants them nothing beyond `is_organization_owner()`, and the screen flags such a
    branch as "cần gán quản lý chi nhánh" rather than pretending it is covered. Compare the role through
    `lib/domain/roles.ts` only — never re-implement the test next to it.
  - Editing a branch needs `branch:update` (a manager, their own branch); creating and deleting need
    `branch:manage` (owner only). `branches_guard_manager_change` keeps `manager_id` an owner decision —
    that column *is* the scope a manager holds, so a head editing it could hand the branch on or take a
    second one. `branches_guard_delete` refuses a branch that still has attendance, schedule, facility or
    revenue rows (the API answers the same `409` with the counts): the cascades would otherwise delete
    operational history silently, and `daily_revenue.branch_id` has no foreign key at all.
  - The screens show the restriction rather than a `403` a click away: a branch the caller does not head is
    a `disabled` option ("— chỉ xem") in every picker whose value is the target of a write (the revenue
    picker, the facility modal) and reads **Chỉ xem** in the row actions (branch, shift, attendance,
    facility, request). `/schedules` goes further and **hides** them (SCRUM-63: the tab is about the
    branches the caller runs — see the `/schedules` note above). Read filters stay usable on purpose —
    reading is not managing.
- `requests_request_type_check` is a hand-made dashboard constraint, and neither PostgREST nor the app can
  read it (the root OpenAPI wants a secret key; PostgREST exposes columns and foreign keys, never a check
  definition). A vocabulary mismatch therefore stays invisible until an insert happens, and then the route
  can only answer `500 ... violates check constraint "requests_request_type_check"` — a schema mismatch
  wearing the costume of a server bug. `SCRUM-62_request_type_constraint.sql` prints the old definition and
  replaces it with the four values `REQUEST_TYPES` sends; **keep that `in (...)` list and `REQUEST_TYPES`
  identical**, because `request_type` is stored *and displayed* verbatim (the queue, the dashboard and quick
  search all read the column as-is, so machine codes would surface in the UI).
- Employee ↔ branch (SCRUM-63) is the fourth axis of the role model, and it lives in the same three places:
  - `users.branch_id` (nullable) is the branch an account belongs to; `null` means "belongs to no branch".
    It is not `branches.manager_id`: that column says who *runs* a branch (and is what `heads_branch()`
    reads for writes), this one says where somebody *works*. A manager may have either, both or neither.
  - `public.current_branch_id()` is the helper the policies read. It must stay `security definer` with
    `set search_path = public` (SCRUM-54's rule) and must never be inlined as `select … from public.users`
    into a policy on `users`.
  - The read policies of `branches`, `requests`, `attendance` and `shift_assignments` keep every SCRUM-53/60
    clause and add the branch test to the **employee half only** (`is_organization_manager()` still comes
    first, so a manager reads the whole organization); `requests_insert_own` and `attendance_insert_own` add
    the same test to their `with check`. An unassigned employee therefore reads nothing branch-scoped, files
    no đơn and checks in nowhere — that is the point of the feature, not a bug to "fix" by widening a policy.
  - `CreateRequestUseCase` answers `403` before the insert (`RequestBranchNotAssignedError` /
    `RequestBranchForbiddenError`) so the caller reads a sentence instead of a policy that matched no row, and
    `/requests` hides "Tạo đơn" for an unassigned account rather than offering a click that must fail.
  - The organization's `OWNER` files no đơn at all: `request:create` is filtered out of
    `OWNER_CAPABILITIES` in `lib/accessPolicy.ts` (so `POST /api/requests` answers `403` for them) and
    `/requests` renders no "Tạo đơn". They review every queue instead — `ReviewRequestUseCase` keeps its
    owner exception only for a *legacy* request an owner filed before this rule, which nobody else could
    decide anyway. The same filter carries `attendance:checkin` (SCRUM-68): the owner never clocks in, so
    `/check-in` renders no button for them and both attendance write endpoints answer `403`.
  - Nobody reviews their own đơn: `ReviewRequestUseCase` throws `RequestSelfReviewError` when the request is
    the approver's own — except for the organization's `OWNER`, whose own request nobody else could decide.
    `/requests` shows "Đơn của bạn" instead of the buttons for the same case (owner excepted).
  - Assignment is owner-only and rides on the existing `users_update_owners` policy through
    `PATCH /api/users/{id}` (`branch_id` omitted keeps the current branch, `null` unassigns). The column is
    readable by every member of the organization via `users_select_authenticated` (SCRUM-24) — a name next to
    a branch is not PII.
  - The organization's `OWNER` is never attached to a branch: `/staff` renders a locked "Không gán chi nhánh"
    cell for them, `toDraft`/`storedBranchId` keep a legacy `branch_id` out of the payload (so a save clears
    it instead of storing it), and `UpdateStaffUseCase` answers `400` ("You cannot assign a branch to the
    organization's owner.") for a branch on an owner while forcing `null` when somebody is *promoted* to
    `OWNER`. A `MANAGER` gets no picker either — their scope is `branches.manager_id`, and the row shows
    what they *head* ("Phụ trách: …") as plain grey text, since `is_organization_manager()` already grants
    them the whole organization. `users.branch_id` is therefore edited **only for an `EMPLOYEE`**, and the
    payload omits it for every other role (omitted keeps the stored value, per the API's contract) which is
    why the amber "Chưa gán: không thấy ca, bảng công hay gửi được đơn" warning is reserved for an
    `EMPLOYEE` as well.
  - **Deploy order: `SCRUM-62` and `SCRUM-63` before the build that ships them.** `GET /api/auth/session`
    selects `users.branch_id`, so on a database that lacks the column *every* authenticated route answers
    `500` with `column users.branch_id does not exist`. Unlike `is_active`, this column is not one the app
    can skip reading, because the shell has to know the caller's branch.
  - A `MANAGER` files a đơn only for a branch they **head** (`CreateRequestUseCase` calls
    `assertBranchManagedBy`, and `POST /api/requests` maps its `BranchForbiddenError` to `403`), and the
    dialog on `/requests` lists those branches alone (`submittableBranches`). Without that, a chi nhánh
    trưởng could open a đơn against somebody else's roster, where nobody but the owner could decide it.
  - The same rule scopes the roster: `GetEmployeeStatusUseCase` filters the `get_employee_status` rows to
    the branches the caller heads through `branchScopeOf()` (`lib/usecases/branchScope.ts`), so a manager
    watches their own people while the owner — and only the owner — still sees the organization, including
    the accounts whose `users.branch_id` is still `null` (exactly who the owner has left to assign).
    `branchScopeOf` returns `{ all: true }` for the owner instead of every id, because a `Set` of ids
    could not tell "belongs to nobody" from "belongs to somebody else". `/employee-status` builds its
    branch filter from the same set, so it never offers a branch whose rows the API would not return.
  - The schedule modal derives the branch from the employee instead of offering a picker
    (`selectEmployee` sets `branchId` from `staff.branch_id` and clears the chosen ca when the branch
    actually changes; the field renders as a statement). This stays a **screen** rule on purpose: the API
    still accepts any branch the caller heads, so covering a shift at another branch remains possible for
    a deliberate call.
- The facility catalogue (SCRUM-65) is the same shape of change as the shift catalogue (SCRUM-58): an
  enum that became data, so the tab can extend it.
  - `public.facility_categories` holds `(organization_id, code, name)`; `code` is what
    `facilities.category` stores and `name` is what the screen shows. The six built-ins are seeded per
    organization, a `after insert` trigger seeds a new tenant, and the unique indexes are
    `(organization_id, code)` / `(organization_id, name)`.
  - `facilities_category_check` is **dropped** and replaced by the composite foreign key
    `facilities_category_fkey (organization_id, category) → facility_categories (organization_id, code)`:
    a value must exist in *this* organization's catalogue, which the old CHECK could not express. The
    repository translates its `23503` into `FacilityCategoryNotFoundError` → `400`, and
    `app/api/facilities/_lib/facilityRequest.ts` now validates the *shape*
    (`FACILITY_CATEGORY_CODE_PATTERN`) rather than membership, because an HTTP parser cannot know a
    tenant's list. Never reintroduce a hard-coded `in (...)` list here.
  - The `code` is derived in `lib/usecases/facilityCategoryCode.ts` (diacritics stripped, uppercased,
    `_`-separated, uniquified with `_2`, `_3`); only the `name` is ever typed by an operator. A duplicate
    name answers `409` from `CreateFacilityCategoryUseCase` (checked case- and accent-insensitively) and
    the unique index is the backstop.
  - There is deliberately **no** UPDATE and no DELETE policy: renaming a `code` would break the facilities
    that store it and deleting one would orphan them. A write needs `is_organization_manager()` (not
    `heads_branch()`): a category belongs to the whole organization, so it is not a per-branch write, and
    a manager who heads no branch may still name a group for the inventory they can read.
  - `/facilities` reads the catalogue from `GET /api/facility-categories` and falls back to the built-in
    six when it cannot be read, so the screen keeps working on a database where
    `SCRUM-65_facility_categories.sql` has not been applied yet; adding a group there then answers `500`
    (its own message), which is the visible symptom to look for.
- The asset tag on a facility (SCRUM-67, hardening SCRUM-66) is generated, not typed: `{số chi
  nhánh}{viết tắt}-{số}`, e.g. `01HSVH-0001` / `02HSVH-0001`, all of it in `lib/usecases/facilityAssetCode.ts`.
  - `branchAssetAcronym(name)` takes the first character of every word (diacritics stripped, `đ→D`; a
    digits-only word keeps up to two digits, so `Quận 1` → `Q1` ≠ `Quận 10` → `Q10`; a one-word name keeps
    its first three letters, `HUFI` → `HUF`; `CN` when nothing usable is left), capped at 6 characters.
  - `branchAssetToken(branch)` prefixes that with `branches.asset_prefix` — the number stored on the branch
    by `SCRUM-67_branch_asset_prefix.sql`, assigned once at creation as `max+1` in
    `SupabaseBranchRepository.create()` (one retry, then `BranchAssetPrefixConflictError` → `409`), unique
    per organization and never reused. **This is what disambiguates two branches that abbreviate
    identically** (`HUFLIT Sư Vạn Hạnh` and `HUFLIT Sư Vạn Hồng` both reduce to `HSVH`): they become
    `01HSVH-…` and `02HSVH-…`, each numbering its own facilities, and a rename cannot move a tag that is
    already printed. A branch whose `asset_prefix` is `null` (created before SCRUM-67, or inserted by hand
    in the dashboard) falls back to the bare acronym and then shares that acronym's sequence — the SCRUM-66
    behaviour, which is why `FACILITY_ASSET_CODE_PATTERN` makes the number optional.
  - The sequence is still `max(existing) + 1` over the codes the caller can read, so there is **no counter
    table and no sequence**: `facilities_organization_code_key` (partial unique on `(organization_id,
    code)`, from `SCRUM-66`) is what actually decides, and its `23505` becomes `FacilityCodeConflictError` →
    `409` — which a *generated* code reaches only through a race between two saves. A number whose row was
    deleted is handed out again; a monotonic counter is the change to make if that ever matters.
  - The tag is **not editable anywhere**: the request parsers reject a body `code` with `400`, `code` is
    absent from `CreateFacilityInput` (`FacilityRecordInput` is the type the repository persists), the modal
    shows a read-only preview it computes with `nextFacilityAssetCode()` over the facilities it already
    loaded, and the branch picker is the only control that can change a tag. A move re-tags the row, and so
    does a legacy value — `UpdateFacilityUseCase` regenerates whenever `FACILITY_ASSET_CODE_PATTERN` no
    longer matches the stored `DA_LAT-0001` or serial, which is what keeps `facilities_code_check`
    satisfiable on an UPDATE and re-tags those rows one by one. `/branches` shows the number and the first
    tag of each branch, so the owner sees what a label says before the inventory exists.
  - A database without the column no longer takes the app down: `withAssetPrefixColumn()`
    (`SupabaseBranchRepository`) catches PostgREST's `42703` and repeats the statement without
    `asset_prefix`, so a project where `SCRUM-67` has not been applied yet keeps working — every branch
    reads `asset_prefix: null`, tags fall back to the bare acronym (the SCRUM-66 shape) and `/branches`
    prints "chưa có số thứ tự" on each row, which is the visible half of the fallback; the server log
    names the script. This is the one column a branch read **may** skip (`users.branch_id` is not, because
    the shell has to know the caller's branch): it only feeds the prefix of a generated code. Applying the
    script turns the numbers on — the retry is per statement, so no restart is needed, and a branch created
    before then is numbered by the script's own backfill.
- Rewriting a policy must only ever *add* to the original condition. Re-creating one from memory and
  dropping a clause (`status = 'PENDING'`, `employee_id = auth.uid()`, the role check) is a silent
  security regression that no typecheck or lint will catch — read the previous definition first, and
  leave the verification query at the end of `SCRUM-53_tenant_scope.sql` in place.
- `supabase/functions/**` is Deno, not Node: `tsconfig.json` excludes it from `npx tsc --noEmit`
  (`deno.json` marks the folder as Deno) and it imports `npm:`/`jsr:` specifiers. An editor without the
  Deno extension therefore reports `Cannot find name 'Deno'` and the unresolved specifier for it — known
  and not real; do not "fix" it with `@ts-nocheck` (banned by the lint config) or with a shim that types
  the service-role client loosely, which is how a fake check gets mistaken for a real one. The app reaches
  it only through `EdgeFunctionStaffProvisioningService`, forwarding the caller's access token; the
  service-role key exists solely in that function's Supabase secrets and must never appear in this
  repository or in a client.
- `POST /api/organizations/accounts` answers `409` for two unrelated conflicts, so read the body rather
  than the status: `Tài khoản này đã là thành viên của tổ chức.` comes from the register row being *claimed*,
  while `Email này đã có tài khoản đăng nhập.` comes from `auth.users` already holding that address. The app
  keeps that distinction instead of collapsing it: `EdgeFunctionStaffProvisioningService` forwards the
  function's own sentence into `StaffAccountEmailTakenError` (its constructor takes it) and `/organization`
  asks `isMemberConflictMessage()` exported from that file, so reword neither side alone — and never write a
  marker phrase into a catch-all sentence, which is exactly how every `409` once rendered as "đã là thành
  viên" for an address that was merely `Chờ vào tổ chức`. That helper matches **both** spellings (the
  Vietnamese sentence, plus the English one an older deployment still answers), so the distinction keeps
  working until the function is pasted into the dashboard again. The second case is invisible in
  `public.users` whenever the SCRUM-50 `on_auth_user_created` trigger was missing when the account was
  made (the function then fails its own profile check with `500` and leaves an auth user behind), which
  is what makes a retry look like a phantom conflict — apply `SCRUM-50_user_registration.sql`, delete
  the leftover auth user, then create it again. `/organization` keeps this outcome on the provisioning
  form itself (`accountError` / `accountNote`) instead of the page-level banner: that banner renders
  above the summary cards, so an error raised while the form is in view is off-screen and reads as
  "nothing happened" — the owner clicks again, and the second attempt is the `409`.
- `lib/publicPaths.ts` has two lists: `PUBLIC_PATHS` (no session needed — `proxy.ts` redirects a
  signed-in visitor away) and `SHELL_LESS_PATHS` (`/onboarding`, `/change-password`: a session is
  required, the navigation is hidden because every link would bounce back, the header stays so the
  account can sign out).
  lets any signed-in account read the directory (id, name, role, `is_active`, `created_at` — nothing else),
  `users_update_managers` limits writes to `OWNER`/`MANAGER`, while `UpdateStaffUseCase` (SCRUM-59) adds the rules the database
  cannot express (only an `OWNER` touches the `OWNER` role; nobody edits their own row). Accounts are still
  created by signing up — a service-role admin API is deliberately not used.
- The chat module reads exactly two tables — `company_documents` (`id, content, embedding, title,
  created_at`) and `user_contracts` (same columns plus `user_id`, scoped to the caller). They are not
  created by any script here, and in the current project they are **empty**, which is why every answer is
  the fixed "Tôi không có thông tin về vấn đề này…" sentence from the prompt: with no retrieved context
  the model is forbidden to invent one. `GET /api/chat/sources` + the "Nguồn tri thức" panel on `/chat`
  exist so that this is visible in the product instead of being guessed at. Embed chunks with
  `gemini-embedding-001` pinned to **768 dims** to match those `vector(768)` columns.
- Branch coordinates are guarded twice, on purpose. `lib/geo/vietnam.ts` `isInsideVietnam()` is the real
  rule (point-in-polygon over `lib/geo/vietnamOutline.ts`, plus a 2 km coastal band so a GPS fix just off the
  drawn coastline is not refused) and is what `app/api/branches/_lib/branchRequest.ts` and the map picker
  call; `branches_vietnam_bounds_check` (SCRUM-57) only knows the country's envelope, because a CHECK
  constraint cannot do point-in-polygon without PostGIS. `lib/geo/vietnamOutline.ts` is **generated** by
  `scripts/extract-vietnam-outline.mjs` (Natural Earth 1:10m, a ~13 MB download — manual, deliberately not
  wired into `predev`/`prebuild`): regenerate it through that script, never by hand, and keep
  `VIETNAM_BOUNDS` the outline's envelope padded by 0.022° (~2.2 km, more than that band) — a tighter
  box would make the database refuse a coordinate the API had accepted.
- `branches.manager_id` is picked from the SCRUM-24 directory (`GET /api/users` without `id`, `OWNER`/`MANAGER`
  only — SCRUM-59 `directory:view`) and never typed: `CreateBranchUseCase`/`UpdateBranchUseCase` run `assertBranchManagerExists` on it,
  and because that profile read goes through the request-scoped client, a manager from another organization
  — or an id that does not exist — is refused with `BranchManagerNotFoundError` → `400` instead of an opaque
  foreign-key failure. A viewer without `directory:view` gets `403` from the directory and so sees
  `Đã gán`/`Chưa gán` rather than a name; that degradation is intended, not a bug.
- The address field on `/branches` is filled by `GET /api/geo/reverse`, the only outbound HTTP call besides
  Gemini: the route proxies two keyless geocoders over the same OpenStreetMap data — Nominatim first,
  Photon (`photon.komoot.io`) as the fallback — so that no key is needed and the app can identify itself
  through a User-Agent, which both providers' usage policies require (Photon answers `400` without one).
  Keep it at one lookup per pin move (Nominatim's policy allows one request per second, so never wire it to
  a keystroke) and keep it server-side: the route is what applies `isInsideVietnam`, so it cannot turn into
  a free geocoding proxy for coordinates anywhere else in the world.
  - `FallbackReverseGeocodingService` (SCRUM-64) owns the rule — first address wins, a `null` ("no address
    here") is remembered as an answer and still lets the next provider try, and only when *every* provider
    fails does the caller see `ReverseGeocodingUnavailableError` → `503`. Never turn that into an `if` in
    the route: the ordering, the logging and the `503` belong in one place.
  - Two providers is not decoration: a filtered DNS (a resolver or a hosts-file rule mapping
    `*.openstreetmap.org` to `127.0.0.1`) refuses the connection in ~300 ms on an otherwise healthy
    machine, and the same block blanks the Leaflet tiles, which come from `tile.openstreetmap.org`. That is
    the `503` an operator reports while every other screen works — check the host resolution before
    touching this code.
- `components/LocationPickerMap.tsx` is the only client-side map: a `next/dynamic({ ssr: false })` wrapper
  around `components/LocationPickerMapCanvas.tsx`, because Leaflet touches `window` while its module is
  evaluated and pulls in the outline. Colours are set with Tailwind classes on the SVG paths rather than
  through `pathOptions` — Leaflet writes an inline presentation attribute that outranks the token — and the
  dimmed "outside Vietnam" area is one polygon whose holes are the outline rings, which only works because
  Leaflet fills with `fill-rule: evenodd`.
- Attendance is written by two clients since SCRUM-68: the mobile app inserts the check-in with its photo,
  and `/check-in` on the web inserts it from the browser (GPS point, no photo — there is no Storage bucket, so
  `check_in_photo_url` stays null and `/attendance` must keep reading "Ảnh xác minh: —" as normal). Both go
  through `RecordCheckInUseCase`: an `EMPLOYEE` against a `SCHEDULED` shift assignment of today (Asia/Bangkok)
  at their own branch, a `MANAGER` against a branch they head with an optional ca — never the organization's
  `OWNER`, which is why `attendance:checkin` is filtered out of `OWNER_CAPABILITIES` and
  `SCRUM-68_attendance_self_checkin.sql` adds `not public.is_organization_owner()` to `attendance_insert_own`.
  `attendance_guard_self_update` (SCRUM-21) blocks an employee from editing their own check-in facts even
  though RLS lets them complete the record — check-out only writes the closing columns, so do not "fix" that
  by widening the policy. `attendance_compute_distance` derives `check_in_distance_m` from the stored
  coordinates, so the distance and the point can never disagree and the API never accepts a distance; the
  *coordinates* are still whatever the device measured, which the server cannot independently verify.
  A duplicate is `(employee, work_date, shift_id)` — the unique index `attendance_employee_shift_day_idx`,
  whose NULLs Postgres treats as distinct, so the null-safe check in the use case is what covers the
  unscheduled case and neither re-implements the other.
  - `POST /api/attendance/check-in` is also **"Vào ca lại"**: a record that already exists for that ca is
    re-opened (`200`, `reopen()` in the repository clears only the closing columns) while the ca is still
    running, so a mistaken check-out costs nothing and never creates a second row. The window is
    `isShiftStillRunning()` (`lib/usecases/attendanceStatus.ts`) — the mirror image of the condition that
    stores `EARLY_LEAVE`, which is why the screen offers the button exactly on a row that reads "Về sớm"
    and the endpoint refuses once the ca is over (`AttendanceAlreadyCheckedInError` with its own sentence).
  - A check-out never erases lateness: `resolveCheckOutStatus` only writes `EARLY_LEAVE` onto an `ON_TIME`
    record, so an employee who arrived late and left early keeps `LATE` until a manager corrects the row.
  - The status of a live row is **derived from the evidence, never trusted from the stored column**:
    `resolveStoredStatus(record, shiftStartTime)` recomputes the arrival verdict from `check_in_at` and the
    ca's `start_time` (Bangkok wall clock, `CHECK_IN_GRACE_MINUTES`) and both the re-open and the check-out
    call it. That is what repairs a row an older build had stamped `EARLY_LEAVE`/`ON_TIME` — reading the
    column back is exactly how a 11:38 arrival for an 08:00 ca once read "Đúng giờ". A row with
    `corrected_by` keeps its status (a manager's correction carries who and why), and a ca template without
    `start_time` can only ever be `ON_TIME` — which `/check-in` says out loud instead of showing a verdict
    the ca never supported.
  - `/attendance` (the Bảng công review screen) is **manager-only** since SCRUM-68 — `attendance:view` is
    not in `EMPLOYEE_CAPABILITIES`, so an employee's own timesheet is `/check-in` (its 30-day history reads
    the same `GET /api/attendance`, under RLS) and the sidebar renders no "Bảng công" link for them.
    A manager and the owner track the organization on that screen and their own ca in the same list through
    its "Chỉ công của tôi" toggle, which sends `employee_id=<me>` to the API — a **server-side** filter, so
    the KPI cards, the counters and the table describe the same rows.
  - Giờ làm excludes the pauses (SCRUM-69): `attendance.worked_seconds` accumulates one segment per check-out
    and `resumed_at` marks when the current segment began, both maintained by the
    `attendance_track_worked_time` trigger (`before insert or update`) — the same derived-column shape as
    `attendance_compute_distance`, and for the same reason: the web check-in, the mobile app and a manager's
    correction all get the arithmetic right without repeating it. The trigger **copies both columns back**
    from the old row on any other update, so no client can write them, and a "Sửa giờ" (`corrected_at`
    changes) recomputes the total from the corrected pair — a corrected row is one continuous span.
    The screens read the total through `lib/usecases/attendanceWorkedTime.ts` (`workedSecondsOf` /
    `workedHoursOf`, which fall back to the raw span for rows written before the script).
    **Deploy order: `SCRUM-68` and `SCRUM-69` before the build that ships them** — `ATTENDANCE_COLUMNS`
    selects `worked_seconds`/`resumed_at`, so a database without them answers `42703` and every attendance
    read (`/attendance`, `/check-in`, the dashboard) fails. Re-opening a ca is `POST /api/attendance/check-in`
    on the same ca while `isShiftStillRunning()` holds; the button on `/check-in` is decided by that clock,
    never by the status column (a `LATE` row that left early must still offer it).
  - A ca nobody closed ends at the ca's **end time** (SCRUM-75): `lib/usecases/attendanceAutoClose.ts`
    (`autoCheckOutAt` / `effectiveCheckOut` / `effectiveWorkedSeconds`) is the only copy of that rule,
    and both screens read it — the row renders `09:14 → 17:00 (tự động)` and giờ làm counts
    `banked + (end − (resumed_at ?? check_in_at))`. `effectiveCheckOut` is applied **only** to a record
    with no giờ ra at all and **only** once the ca's end has passed: a real check-out always wins, a ca
    still running keeps `--:--` (the employee may still press the button), a zero-length template
    (`Nghỉ`) and a ca without `end_time` are left alone, and an `EARLY_LEAVE` is never *derived* from it
    — forgetting to clock out is not leaving early, so the marker is what tells the reviewer the time was
    inferred, and "Sửa giờ" pre-fills it so one save turns the inference into a recorded fact (with who
    and why). Nothing writes `check_out_at` automatically: a true auto-close at the end of every ca needs
    a scheduled job (`pg_cron`) or a lazy sweep, which is a separate, ask-first change.
- A bell that reads `0` on a busy day means `SCRUM-70/71/72` have not been applied: nothing in the app
  writes `notifications` (SCRUM-48 shipped the schema with no INSERT policy and no producer at all). A
  single missing notification, on the other hand, is usually the fan-out doing its job — the actor is never
  told about their own click, an inactive account is dropped from a recipient set, the recipient switched
  `in_app` off, or the same `user + type + entity` was written within the last five minutes.
- `public.users` has carried an `after insert or update` notification trigger since SCRUM-72, so a bulk
  `update public.users …` typed in the dashboard rings one bell per changed row. That is intended; fan out
  one statement at a time, or delete the rows it created.

## Tóm tắt (Tiếng Việt)

- Đây là web admin Next.js 16 (App Router) của **Humora HR**, dùng Supabase (PostgreSQL + Auth + RLS) làm backend.
- Kiến trúc Clean Architecture: `lib/domain` (entities, interfaces, errors) → `lib/usecases` (nghiệp vụ)
  → `lib/infrastructure` (Supabase repositories, Gemini). Route handler trong `app/api/**/route.ts` chỉ
  nhận request, xác thực, gọi đúng một use case rồi map lỗi sang mã HTTP.
- Chạy lệnh trong thư mục `hr_website/`: `npm run dev`, `npx tsc --noEmit`, `npm run build`.
  Chưa có test runner trong dự án; `npm run lint` còn lỗi tồn đọng nên chỉ lint các file mình sửa.
- Mọi route API phải có khối JSDoc `@swagger`; schema dùng chung khai báo trong `lib/swagger.ts`,
  file `public/swagger.json` là file sinh tự động, không sửa tay.
- Phân quyền ba cấp (SCRUM-59/60): `OWNER` / `MANAGER` / `EMPLOYEE` (giá trị cũ `CHU` được
  `normalizeRole` quy về `MANAGER`). Bảng năng lực & bảng màn hình ở `lib/accessPolicy.ts`; route handler
  bắt đầu bằng `requireCapability("…")` từ `app/api/_lib/requireCaller.ts`; trang ẩn nút bằng
  `useProfile().can(…)`; RLS (`is_organization_manager()` / `is_organization_owner()`) là lớp quyết định.
  Thứ tự triển khai: `SCRUM-59` → app + Edge Function `staff-account` → `SCRUM-60`.
- Phạm vi chi nhánh (SCRUM-61): trưởng chi nhánh (`branches.manager_id`) chỉ quản lý chi nhánh của mình.
  Quy tắc nằm ở `lib/domain/branchScope.ts` (`canManageBranch`, `defaultBranchId`) và
  `lib/usecases/branchScope.ts` (`assertBranchManagedBy` → `403`); RLS dùng helper `public.heads_branch()`
  (`security definer`) trong policy ghi của `branches`, `daily_revenue`, `shift_assignments`, `attendance`,
  `facilities`, `requests`. Tạo/xoá chi nhánh thuộc `OWNER` (`branch:manage`), sửa chi nhánh mình thuộc
  `branch:update`, và xoá chỉ thành công khi chi nhánh không còn dữ liệu (`409` kèm số lượng).
- Nhân viên thuộc một chi nhánh (SCRUM-63): `users.branch_id` + helper `public.current_branch_id()`;
  RLS thu hẹp phần **nhân viên** trong policy đọc của `branches`/`requests`/`attendance`/`shift_assignments`
  vào chi nhánh của họ, và chặn gửi đơn / chấm công khi `branch_id` còn `null`. Gán chi nhánh ở `/staff`
  (chỉ chủ sở hữu); không ai tự duyệt đơn của mình, trừ chủ sở hữu. Quản lý chỉ gửi đơn cho chi nhánh mình
  phụ trách, chỉ thấy nhân sự thuộc chi nhánh mình ở `/employee-status` (lọc ở `GetEmployeeStatusUseCase`
  qua `branchScopeOf`), và trong modal xếp ca thì chi nhánh lấy theo nhân viên được chọn (không chọn tay).
  Chạy `SCRUM-62` (ràng buộc `request_type`) và `SCRUM-63` **trước** khi deploy build này — `GET /api/auth/session`
  đọc cột mới.
- Danh mục nhóm thiết bị (SCRUM-65): `public.facility_categories` (theo tổ chức) thay cho ràng buộc CHECK
  cũ; `facilities.category` nay là khoá ngoại tổ hợp trỏ vào danh mục đó. API `GET`/`POST /api/facility-categories`
  (quyền `facility:manage`) và nút "Nhóm thiết bị" trên `/facilities` cho phép thêm nhóm mới; mã (`code`) do
  `facilityCategoryCode()` sinh ra, chỉ tên nhóm do người dùng nhập. Chạy `SCRUM-65_facility_categories.sql`
  trước/ cùng lúc với build này.
- Mã tài sản (SCRUM-67, tiếp nối SCRUM-66): sinh tự động dạng `{số chi nhánh}{viết tắt}-{số}`
  (`01HSVH-0001`) trong `lib/usecases/facilityAssetCode.ts`; viết tắt lấy chữ đầu của từng từ trong tên chi
  nhánh, còn số thứ tự chi nhánh nằm ở `branches.asset_prefix` (script `SCRUM-67_branch_asset_prefix.sql`,
  cấp một lần khi tạo chi nhánh, trùng thì trả `409`). Nhờ vậy hai chi nhánh cùng viết tắt
  (`HUFLIT Sư Vạn Hạnh` / `HUFLIT Sư Vạn Hồng` → `HSVH`) vẫn có mã riêng: `01HSVH-…` và `02HSVH-…`. Mã
  **không sửa được ở đâu cả**: API trả `400` nếu thân yêu cầu có `code`, ô "Mã tài sản" chỉ hiển thị, đổi
  chi nhánh thì hệ thống cấp lại mã. Số thứ tự trong mã vẫn lấy theo mã lớn nhất của đúng token đó (không có
  bảng đếm) và unique index `facilities_organization_code_key` là ràng buộc thật — trùng mã trả `409`. Chạy
  `SCRUM-67` **trước** build này, vì `/api/branches` đọc cột mới.
- Tra cứu địa chỉ (SCRUM-64): `GET /api/geo/reverse` thử Nominatim rồi tới Photon
  (`FallbackReverseGeocodingService`) — cả hai đều miễn phí, cùng dữ liệu OpenStreetMap, cần User-Agent của
  ứng dụng; chỉ khi cả hai đều lỗi mới trả `503`. Nếu máy bị chặn DNS `*.openstreetmap.org` (phân giải về
  `127.0.0.1`) thì bản đồ Leaflet cũng mất tile — kiểm tra DNS trước khi sửa code.
- Thay đổi CSDL viết thành file SQL mới trong `supabase/sql/` và chạy thủ công trong Supabase SQL Editor;
  không sửa file đã chạy.
- Thông báo (SCRUM-70/71/72): CSDL là nơi **sinh** thông báo, app chỉ **đọc**. Trước đây SCRUM-48 không có
  nguồn ghi nào nên chuông luôn bằng 0; nay mỗi hoạt động có một trigger gọi `notify_user`/`notify_users`
  (`security definer`, đã `revoke execute` khỏi `public`/`anon`/`authenticated` để không ai giả mạo được).
  Mã `type` do trigger lưu, `lib/domain/notificationCatalog.ts` lo nhãn/nhóm/link "Xem"; cố ý **không** đặt
  CHECK constraint cho `type`. Nhân viên nhận việc của mình, quản lý nhận việc của chi nhánh mình (chỉ các
  bất thường chấm công), chủ sở hữu nhận toàn tổ chức. `GET /api/notifications` lọc ở server
  (`unread`, `read`, `type=a,b,c`), `POST /api/notifications/read-all` đánh dấu đã đọc bằng một câu lệnh, và
  `/notifications` cùng chuông ở header tự làm mới mỗi 30 giây. Chạy `SCRUM-70` → `71` → `72` trước hoặc
  cùng lúc với build.
- Cài đặt kênh nhận trên `/notifications` báo `500 Unable to update notification settings.` cho **mọi** vai
  trò: không phải lỗi phân quyền mà là bảng `notification_settings` (bảng tạo tay trước SCRUM-48, nên
  `updated_at … default now()` khai báo trong SCRUM-48 không hề được tạo; trigger `before update` không chạy
  khi INSERT, mà API chỉ ghi `user_id, channel, enabled`) — chạy
  `SCRUM-77_notification_tables_write_path.sql` (khôi phục các default đã khai báo, kiểm tra lại upsert của
  drawer và so `stored` với `gate` của `notification_in_app_enabled()`), hoặc `SCRUM-76` nếu lỗi nằm ở bảng
  `notifications`.

- Lỗi 500 khi ghi nghiệp vụ (ví dụ quản lý chi nhánh bấm "Khai báo mở ca" và nhận dòng
  `Unable to declare opening revenue.`, trong khi chủ sở hữu làm được): nguyên nhân là **thông báo kéo
  theo cả câu lệnh**. Trigger `after insert` của `daily_revenue` (SCRUM-71) chạy trong cùng transaction,
  nên khi bảng `notifications` từ chối dòng mà `notify_user` ghi (`23502` ở cột cũ `content` vẫn `NOT
  NULL`) thì khai báo doanh thu cũng bị rollback và API chỉ trả `500` chung chung. Cách sửa: chạy
  `SCRUM-76_notifications_never_break_business_writes.sql` (một lần dán: nới mọi cột bắt buộc cũ, cài lại
  `notify_user` có guard, in `OK`/`FAILED` kèm lý do thật của CSDL) — hoặc `SCRUM-74` rồi `SCRUM-73`.
  Xem log terminal (`Failed to declare opening revenue`) trước khi nghi ngờ RLS: nếu là lỗi phân quyền chi
  nhánh thì API đã trả `403` kèm câu mô tả quy tắc.
- Đăng nhập nhanh bằng Face ID (SCRUM-79): `/security` bật Passkey cho **từng thiết bị** (`auth.passkey.*`),
  `/login` có nút "Đăng nhập bằng Face ID" (`signInWithPasskey()`), còn mật khẩu vẫn dùng được nên mất thiết
  bị không mất tài khoản. Không lưu dữ liệu khuôn mặt: khoá riêng tư nằm trong thiết bị, Supabase Auth giữ
  khoá công khai — **không cần script SQL nào**. Đây là chỗ duy nhất dùng `createBrowserClient`
  (`lib/infrastructure/browserSupabaseClient.ts`) vì WebAuthn chỉ chạy trong trình duyệt; client này ghi cùng
  cookie phiên mà server đọc, không thay thế `createSupabaseServerClient()`. Điều kiện: Supabase Dashboard →
  Authentication → Passkeys (bật + Relying Party ID = tên miền thật, `localhost` khi dev) và **HTTPS** khi chạy
  thật — Passkey vẫn là tính năng thử nghiệm của Supabase và phải bật riêng cho từng thiết bị. Yêu cầu Face ID
  trước khi chấm công là bước tiếp theo (SCRUM-80), hiện chưa bật.

- Giao diện điện thoại: `md` (768px) là mốc duy nhất. Danh sách điều hướng chỉ nằm ở
  `components/navigation.ts` — `Sidebar` cho màn hình rộng, `MobileNav` là ngăn kéo trượt cho điện thoại (mở
  bằng nút hamburger trên header, đóng bằng nền mờ / ✕ / Escape / đổi trang / khi màn hình rộng trở lại).
  Dưới `md` trang cuộn theo luồng tài liệu (không dùng khung `h-dvh`) để bàn phím iOS không che ô nhập, và
  `app/globals.css` ép cỡ chữ ô nhập về 16px để Safari không tự phóng to khi chạm vào ô. Không dùng hiệu ứng
  chỉ có khi hover; hộp thoại giới hạn `max-h-[85dvh]`, nằm dưới cùng màn hình và `p-4 sm:p-6`; vùng chạm
  tối thiểu ~40px. Chi tiết ở `DESIGN.md` §4.4.
- Sửa lỗi tạo tài khoản nhân viên (`role must be EMPLOYEE or CHU.`): file Edge Function **trong repo đã
  đúng** (`INVITE_ROLES = ["EMPLOYEE","MANAGER"]` kèm alias `CHU → MANAGER`), nên thông báo trên màn hình
  đến từ **bản triển khai cũ**. Cách sửa: dán lại `supabase/functions/staff-account/index.ts` vào Dashboard →
  Edge Functions → `staff-account` → Deploy, sau đó tạo lại tài khoản với vai trò quản lý. Phía web cũng đã
  chặn rò rỉ tiếng Anh: `accountErrorMessage` trả câu tiếng Việt cho `400/422`.
- Ngôn ngữ & thông báo lỗi: mọi câu người dùng nhìn thấy từ server (payload `error`, domain error, Edge
  Function) **đều là tiếng Việt**; log `console.error`/repository vẫn tiếng Anh vì chỉ nằm trong log và đi
  kèm thông báo tiếng Anh của Postgres. Nơi quyết định mã HTTP bằng cách so khớp câu thông báo phải so khớp
  phần ổn định (tên trường như `status`, hoặc cụm tiếng Việt) — hai bên phải đổi cùng nhau.
- Đa ngôn ngữ (vi/en): câu chữ nằm ở `lib/i18n/messages/vi.ts` (nguồn) và `messages/en.ts`, cùng kiểu
  `Record<MessageKey, string>` nên thiếu khóa là `tsc` báo lỗi; component đọc qua `useLocale()` + `t()`
  (`components/LocaleProvider.tsx`), còn `components/navigation.ts` chỉ lưu `labelKey`. Ngôn ngữ lưu ở cookie
  `humora-locale` (server đọc trong `app/layout.tsx` để `<html lang>` đúng ngay byte đầu) và
  `components/LanguageToggle.tsx` là nút chuyển. Màn hình nào chưa chuyển vẫn giữ tiếng Việt — chuyển từng
  màn, không làm ồ ạt.
- Thời gian nghiệp vụ theo `Asia/Bangkok` (UTC+7), dữ liệu lưu ở UTC; không tự ý đổi múi giờ.
