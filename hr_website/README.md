# Humora HR Website

Web admin for the HR & shift operations of **Humora**: declare and reconcile
per-shift revenue, approve staff requests, schedule shifts, record attendance, see who is working
right now, deliver notifications, search everything quickly, and answer policy/contract questions
with an AI assistant powered by Google Gemini.

It is a **Next.js 16 (App Router) + TypeScript** application in which **Supabase is the whole
backend** (PostgreSQL + Auth + Row Level Security). Route handlers under `app/api/` authenticate the
caller, run one use case and return JSON — there is no separate API server, no ORM and no background
worker.

## What it does

| Screen (`app/`)    | Vietnamese label     | Purpose                                                                         |
| ------------------ | -------------------- | ------------------------------------------------------------------------------- |
| `/`                | Tổng quan            | Landing dashboard with headline KPIs                                            |
| `/branches`        | Quản lý chi nhánh    | Branch registry: address, manager, GPS geofence and attendance radius (SCRUM-47) |
| `/facilities`      | Cơ sở vật chất       | Per-branch equipment registry with quantity and condition (SCRUM-45/46)         |
| `/revenue`         | Doanh thu            | Declare opening cash, count the drawer, reconcile closing revenue (SCRUM-39/40) |
| `/requests`        | Đơn từ               | Review leave / shift-swap / adjustment requests, approve or reject (SCRUM-41)   |
| `/schedules`       | Lịch làm việc        | Weekly shift schedule: assign an employee to a shift template per day (SCRUM-30). A manager sees only the branches they head and only the employees of those branches (SCRUM-63) |
| `/employee-status` | Trạng thái nhân viên | Live roster: đang làm, chưa vào ca, nghỉ phép, đã tan ca, không có ca (SCRUM-22) |
| `/attendance`      | Bảng công            | Timesheet review for managers: giờ vào/ra, vị trí theo bán kính chi nhánh, giờ làm không tính khoảng nghỉ (SCRUM-69) và tự động tính giờ ra bằng giờ kết thúc ca khi nhân viên không bấm "Ra ca" (SCRUM-75, cột giờ ra đánh dấu **tự động**), sửa giờ, khiếu nại (SCRUM-21/22/23/29), with a "Chỉ công của tôi" toggle so a manager/owner can track their own rows in the same list. Employees hold no `attendance:view` since SCRUM-68 — their own timesheet is `/check-in` |
| `/check-in`        | Chấm công            | Web vào ca / ra ca for the two roles that work a ca: an employee checks in against today's scheduled ca, a manager against a branch they head. GPS point, `ON_TIME`/`LATE`, "Vào ca lại" while the ca is still running, giờ làm that excludes the pauses (SCRUM-69) and ends a forgotten ca at its end time (SCRUM-75), and a 30-day personal history; the owner never clocks in (SCRUM-68) |
| `/staff`           | Quản lý nhân sự      | Staff administration: roles, gán chi nhánh làm việc, cho nghỉ việc / kích hoạt lại (SCRUM-24/63) |
| `/organization`    | Tổ chức              | Organization home: join code, the register of accounts, tạo tài khoản có mật khẩu tạm (SCRUM-51/52). Reached from onboarding and from the organization card in the sidebar — deliberately not a navigation tab |
| `/onboarding`      | Bắt đầu              | Create an organization or join one with its code — where an account with no organization lands (SCRUM-51) |
| `/reports`         | Báo cáo              | Revenue reporting and analysis screen (SCRUM-44 provides the aggregation API)   |
| `/notifications`   | Thông báo            | The inbox (SCRUM-48) fed by the database (SCRUM-70/71/72): every activity of the three roles writes a row — doanh thu mở/chốt ca (kể cả lệch), đơn từ gửi/duyệt, xếp/đổi/xoá ca, chấm công bất thường, sửa giờ, khiếu nại, nhân sự, chi nhánh, thiết bị, tổ chức. Server-side filters (`unread`/`read`/`type`), group chips, a "Xem" link to the screen the row belongs to, one-statement "đánh dấu tất cả đã đọc", and per-channel settings |
| `/chat`            | Trợ lý AI            | Ask about internal policies and your own contract                               |
| `/login`, `/register` | Đăng nhập / Đăng ký | Supabase Auth sign-in and self-registration (both render outside the app shell) |
| `/api-docs`        | —                    | Swagger UI for every endpoint                                                   |

Quick search (SCRUM-49) is reachable from the header search box and from `GET /api/search` — the box is
wired to it, the bell shows an exact unread count, and the theme switch (Sáng / Tối / Theo hệ thống) sits
next to them; see "Header" further down.

Notifications have no endpoint to create them: the database is the producer (SCRUM-70/71/72) and the app
is only the reader. A trigger per activity writes one row per recipient — the employee hears about their
own ca, đơn and bảng công; the head of a branch hears about its đơn, its timesheet exceptions and its
khiếu nại; the chủ sở hữu hears the organization (doanh thu kể cả khi lệch, nhân sự, chi nhánh, thiết
bị). Nobody is told about their own click, and the fan-out skips a recipient whose `in_app` switch is off.
The reader side is `lib/domain/notificationCatalog.ts`: the code a trigger stored becomes a Vietnamese
label, a group chip and the "Xem" link, and a code the catalog does not know still renders instead of
breaking the inbox.

## Tech stack

| Concern           | Choice                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- |
| Framework         | Next.js 16 (App Router, Turbopack) + React 19                                          |
| Language          | TypeScript 5 with `strict: true`, no `any`                                             |
| Backend / data    | Supabase — PostgreSQL, Auth, Row Level Security, SQL RPC functions                     |
| Supabase client   | `@supabase/ssr` request-scoped server client (App Router cookies)                      |
| AI assistant      | `@google/generative-ai` — `gemini-embedding-001` embeddings (768 dims) + `gemini-3.5-flash` answers |
| Styling           | Tailwind CSS v4 (`@tailwindcss/postcss`), `lucide-react`, Be Vietnam Pro font          |
| Map picker        | `leaflet` + `react-leaflet` (client-only, OpenStreetMap tiles) for the branch GPS picker |
| API documentation | `next-swagger-doc` from JSDoc `@swagger` blocks + `swagger-ui-react`                   |
| Tooling           | npm, ESLint 9 (`eslint-config-next`), `tsx` for generator scripts                      |

## Architecture

Clean Architecture with a one-way dependency flow: HTTP concerns stay in the route handlers, business
rules live in use cases, and only the infrastructure layer knows about Supabase.

```text
app/api/**/route.ts        Route handler   parse • validate • authenticate • map errors → HTTP status
        │ constructs
        ▼
lib/usecases/*UseCase.ts   Use case        business rules; depends on interfaces only
        │ depends on
        ▼
lib/domain/**              Domain          entities (snake_case), I*Repository / ILLMService, typed errors
        ▲ implements
        │
lib/infrastructure/**      Infrastructure  Supabase*Repository, GeminiLLMService, NominatimReverseGeocodingService, supabaseClient
```

- A use case never imports Next.js or Supabase; a repository never contains business rules.
- Every request goes through `createSupabaseServerClient()`, which builds a client from the caller's
  cookies — so **RLS decides what data a request can see**, and no service-role key exists in the code.
- Aggregation and semantic search are pushed into the database as RPCs (`get_revenue_report`,
  `get_employee_status`, `match_company_documents`, `match_user_contracts`) rather than done in JavaScript.

## Project structure

```text
hr_website/
├── app/
│   ├── api/                      Route handlers, one folder per resource (each with a `@swagger` block)
│   ├── api-docs/                 Swagger UI page
│   ├── login/page.tsx            Sign-in screen (rendered outside the app shell)
│   ├── register/page.tsx         Self-registration screen (same, needs SCRUM-50 applied)
│   ├── <segment>/page.tsx        Screens: branches, facilities, revenue, requests, schedules,
│   │                             attendance, employee-status, reports, notifications, chat
│   │                             (+ dashboard at app/page.tsx)
│   ├── layout.tsx                Root layout: Be Vietnam Pro font + the Sidebar/Header shell
│   └── globals.css
├── components/                   Header.tsx (quick search + session user + sign-out), Sidebar.tsx (navigation),
│                                 LocationPickerMap.tsx (Leaflet picker, lazy) + LocationPickerMapCanvas.tsx
├── proxy.ts                      Route protection + Supabase session refresh (Next.js 16 proxy, née middleware)
├── lib/
│   ├── domain/entities/          Plain interfaces; DB-backed fields stay snake_case
│   ├── domain/errors/            Typed error classes (RevenueAlreadyDeclaredError, ...)
│   ├── domain/repositories/      IRevenueRepository, INotificationRepository, ILLMService, ...
│   ├── usecases/                 One class per business action + businessDay.ts (Asia/Bangkok helper)
│   ├── infrastructure/           supabaseClient.ts, Supabase*Repository.ts, GeminiLLMService.ts,
│   │                             NominatimReverseGeocodingService.ts (branch address lookup)
│   ├── publicPaths.ts            Screens that hide the shell (/login, /register) — see proxy.ts
│   ├── geo/vietnamOutline.ts     Vietnam land outline (`[lat, lng]` rings) — generated, do not edit by hand
│   ├── geo/vietnam.ts            isInsideVietnam() (point-in-polygon + a 2 km coastal tolerance band) + VIETNAM_BOUNDS
│   └── swagger.ts                OpenAPI definition + shared component schemas
├── scripts/generate-swagger.ts   Writes public/swagger.json (runs via predev / prebuild)
├── scripts/ingest-knowledge.ts   Chunks docs/ → embeds → writes supabase/sql/knowledge_seed.sql
├── scripts/extract-vietnam-outline.mjs  Natural Earth 1:10m → lib/geo/vietnamOutline.ts (manual regen)
├── docs/                         Source documents (.md/.txt) for the AI knowledge base
├── supabase/sql/                 Idempotent SQL scripts, applied by hand (see Database)
├── public/swagger.json           Generated — never edit by hand
└── AGENTS.md / CLAUDE.md         Agent and contributor rules (single source of truth)
```

## Getting started

### Prerequisites

- **Node.js 20+** and **npm** (developed on Node 22 / npm 10).
- A **Supabase project** (URL + anon key) with the objects from `supabase/sql/` applied.
- A **Google Gemini API key** if you want the AI assistant to answer questions.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in this folder (it is git-ignored — never commit it):

| Variable                        | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key — authorisation is enforced by RLS, not here |
| `GEMINI_API_KEY`                | Gemini key used for embeddings and chat answers                         |

Missing values do not break the build: the request that needs them throws at runtime
(`createSupabaseServerClient`, `GeminiLLMService`).

### 3. Create the database objects

Run the scripts in `supabase/sql/` from **Supabase Dashboard → SQL Editor**, in the order listed in
[Database & Supabase](#database--supabase).

### 4. Run

```bash
npm run dev      # http://localhost:3000 — predev regenerates public/swagger.json first
npm run build    # production build (may need outbound access to fonts.googleapis.com)
npm start        # serve the production build
```

Then open <http://localhost:3000> for the app and <http://localhost:3000/api-docs> for the API reference.

## API reference

Everything returns JSON. **session** means the handler requires a Supabase Auth session cookie and
answers `401` without one; **public** means the route needs no session (`POST /api/auth/sign-in` and
`POST /api/auth/sign-up`). There are **no demo endpoints any more** — every route reads a real table or
an RPC, and the in-memory mock store is gone.
Each route file documents itself with a JSDoc `@swagger` block.

| Method & path                        | Auth              | Data source                   | Notes                                                                                                                                                |
| ------------------------------------ | ----------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-in`             | public            | Supabase Auth                 | Body `{ email, password }` → `{ userId, email }` plus the session cookies; `401` on wrong credentials, `400` on invalid input                       |
| `POST /api/auth/sign-up`             | public            | Supabase Auth + `users`       | Body `{ email, password, full_name }` → `201` `{ userId, email, emailConfirmationRequired }`; `409` when the email is taken, `400` on invalid input. The `users` profile row comes from the `SCRUM-50` trigger |
| `POST /api/auth/sign-out`            | session           | Supabase Auth                 | Clears the session cookies; safe to call without an active session                                                                                   |
| `GET /api/auth/session`              | session           | `users`                       | Profile of the signed-in account; `401` without a session, `404` when the account has no `users` row                                                 |
| `POST /api/revenue/open`             | session           | `daily_revenue`               | Body `{ branch_id, open_amount }` → `201`; `409` if the branch already declared today; `400` on bad input; `403` unless the caller heads that branch (SCRUM-61)                                            |
| `PUT /api/revenue/close`             | session           | `daily_revenue`               | Body `{ branch_id, close_amount, close_note?, close_image_url? }` — both optional fields are nullable and `null` clears them → `{ revenue, revenue_difference }`; `404` without an opening record; `403` unless the caller heads that branch (SCRUM-61) |
| `GET /api/revenue/report`            | session           | RPC `get_revenue_report`      | `branch_id?`, `period=day\|week\|month\|quarter\|year` (default `day`), `date=YYYY-MM-DD`; returns series, summary and period-over-period comparison |
| `GET /api/revenue`                   | session           | `daily_revenue`               | Row-level sibling of the report: `branch_id?`, `days=1..31` (default 7, Asia/Bangkok business days), `status=open\|closed\|all` → the records, newest first, capped at 100 |
| `GET /api/requests`                  | session           | `requests`                    | Approval queue (SCRUM-41) with the requester name embedded; filters `status`, `branch_id` (the value `all` disables a filter)                        |
| `POST /api/requests`                 | session + role    | `requests`                    | Body `{ branch_id, request_type, title, content? }` → `201` the stored request (still `PENDING`); `request_type` is one of `Nghỉ phép` / `Đổi ca` / `Điều chỉnh công` / `Khác` (`REQUEST_TYPES`), `content` may be omitted or `null`. Every member may file their own đơn (`request:create`) **except the organization's `OWNER`**, who reviews instead of filing (`403`); `requests_insert_own` forces `user_id = auth.uid()` with `status = PENDING`; `400` on bad input, `403` when the account owns no branch or files for another one (SCRUM-63), `404` for a branch outside the caller's organization |
| `PATCH /api/requests/{id}/review`    | session + role    | `requests`                    | `{ status: "APPROVED" \| "REJECTED", reject_reason? }` → the updated request; a reason is required to reject; `403` unless the caller holds `request:review` (`OWNER`/`MANAGER`) and heads the request's branch (SCRUM-61; the owner reviews a request that lost its branch) |
| `GET /api/shifts`                    | session           | `shifts` (catalogue)          | The shift templates (`Ca sáng` 08:00–17:00, ...) that `/api/schedules` assigns; `branch_id = null` means every branch                          |
| `GET /api/schedules`                 | session           | `shift_assignments`           | Filters `branch_id`, `employee_id`, `start_date`, `end_date`; each row embeds the employee name and the shift hours                          |
| `POST /api/schedules`                | session           | `shift_assignments`           | Body `{ employee_id, branch_id, shift_id, work_date, status?, note? }` → `201`; `409` when the employee already has an overlapping shift, `404` for an unknown template; `403` unless the caller heads the branch being scheduled into (SCRUM-61) |
| `PUT /api/schedules/{id}`            | session           | `shift_assignments`           | Replaces the editable fields of one assignment; `400` if `id` is not a UUID, `404` when missing, `409` on overlap; `403` unless the caller heads both the stored and the destination branch (SCRUM-61)                            |
| `DELETE /api/schedules/{id}`         | session           | `shift_assignments`           | Removes one assignment (`404` when missing); `403` unless the caller heads that branch (SCRUM-61)                                                                                                 |
| `GET /api/facilities`                | session           | `facilities`                  | Per-branch equipment, optionally filtered by `branch_id`                                                                                    |
| `POST /api/facilities`               | session + role    | `facilities`                  | Body `{ branch_id, name, category?, quantity?, condition?, last_checked_at?, note? }` → `201`; writes need `facility:manage` (`OWNER`/`MANAGER`) and the caller must head that branch (SCRUM-61), which RLS repeats. `category` is a code of the organization's catalogue (SCRUM-65) — an unknown one answers `400`. The asset tag is generated (SCRUM-67) as `{số chi nhánh}{viết tắt chi nhánh}-{số}` — `01HSVH-0001`, `02HSVH-0001` — and is read-only, so a body that sends a `code` answers `400` |
| `PUT /api/facilities/{id}`           | session           | `facilities`                  | Replaces the editable fields of one facility; `404` when missing or not updatable; `403` unless the caller heads both the stored and the destination branch (SCRUM-61); `400` when `category` is not in the organization's catalogue (SCRUM-65) or the body carries a `code` (SCRUM-67). The stored tag is kept while it still matches the branch; a move, or a legacy code from before the field became read-only, gets a fresh one for the branch the row lands in |
| `DELETE /api/facilities/{id}`        | session           | `facilities`                  | Retires a facility from the registry (`404` when missing); `403` unless the caller heads that branch (SCRUM-61)                                                                                   |
| `GET /api/facility-categories`       | session + role    | `facility_categories`         | The "Nhóm thiết bị" catalogue of the organization (SCRUM-65): the six built-ins plus the groups the tab has added, sorted by name; `403` unless the caller holds `facility:manage` (`OWNER`/`MANAGER`) |
| `POST /api/facility-categories`      | session + role    | `facility_categories`         | Body `{ name }` → `201` with the new category; the `code` stored in `facilities.category` is derived from the name (diacritics stripped, uppercased, uniquified). `409` when that name already exists, `400` when it is empty or longer than 60 characters |
| `GET /api/attendance`                | session           | `attendance`                  | Timesheet with the employee, the shift hours and the branch geofence embedded; filters `branch_id`, `employee_id`, `status`, `start_date`, `end_date` |
| `POST /api/attendance/check-in`      | session + role    | `attendance`                  | Body `{ latitude?, longitude?, branch_id?, shift_id?, note? }` → `201` with the created record (the database derives `check_in_distance_m` from the point). Needs `attendance:checkin` — every member **except the organization's `OWNER`** (SCRUM-68), who answers `403`. An employee passes the `shift_id` of today's `SCHEDULED` ca and is checked in at their own branch; a manager names a branch they head (`403` otherwise, `404` when unknown) and may name any ca. Sending the same ca again while it is still running is **"Vào ca lại"**: the existing row is re-opened and answered `200` (its giờ vào untouched), which is how a mistaken check-out is undone. `409` when that ca is still open, its working time is over (the check-out stands) or nothing is scheduled for today — and `400` when a manager sends no branch or the coordinates are half a pair |
| `POST /api/attendance/check-out`     | session + role    | `attendance`                  | Body `{ attendance_id?, latitude?, longitude? }` → `200` with the closed record; closes one of today's own rows (the single open one, or the named `attendance_id`) and stores `EARLY_LEAVE` when the ca's end time has not been reached. `404` when nothing was checked in today (or the id is not one of today's own), `409` when that record is already closed, `400` when more than one ca is open and no id was sent |
| `POST /api/attendance/complaints`    | session           | `attendance`                  | Body `{ attendance_id, complaint }` → `201`; the employee on the record or a manager of that branch may raise it (SCRUM-61), anyone else gets `403`              |
| `PATCH /api/attendance/{id}/verify`  | session + role    | `attendance`                  | Stamps `verified_by`/`verified_at` on one record (the web review action); `403` unless the caller holds `attendance:review` (`OWNER`/`MANAGER`) and heads that branch (SCRUM-61) |
| `PATCH /api/attendance/{id}`         | session + role    | `attendance`                  | Sửa giờ: replaces giờ vào/ra, `status` and note, and stamps `corrected_by`/`corrected_at` with the mandatory `correction_reason`; `400` when giờ ra precedes giờ vào, `403` unless the caller holds `attendance:review` and heads that branch (SCRUM-61) |
| `PATCH /api/attendance/complaints/{id}` | session + role | `attendance`                  | Body `{ status: "RESOLVED" }` → closes an open khiếu nại and stamps `complaint_resolved_by`/`complaint_resolved_at`; `400` when the record has no complaint, `403` unless the caller holds `attendance:review` and heads that branch (SCRUM-61) |
| `GET /api/employee-status`           | session + role    | RPC `get_employee_status`     | One row per person for one business day (Asia/Bangkok), derived from the schedule + timesheet; filters `branch_id`, `work_date`; `403` unless the caller holds `employee-status:view` (`OWNER`/`MANAGER`). A manager gets only the people whose `users.branch_id` is one of the branches they head (SCRUM-63); the owner gets the whole organization, unassigned accounts included |
| `GET /api/notifications`             | session           | `notifications`               | Paginated: `page` (≥1), `page_size` (≤100, default 20), `unread=true` to keep only unread rows (which also makes `total` the exact unread count) → `{ data, total, page, page_size }` |
| `PATCH /api/notifications/{id}/read` | session           | `notifications`               | Marks one notification read; `400` if `id` is not a UUID, `404` if it does not belong to you                                                         |
| `GET /api/notifications/settings`    | session           | `notification_settings`       | Channel preferences of the caller                                                                                                                    |
| `PUT /api/notifications/settings`    | session           | `notification_settings`       | Body `{ settings: [{ channel, enabled }] }`, upserted per `(user_id, channel)`                                                                       |
| `GET /api/search`                    | session + profile | `users`, `requests`, `shifts` | `q` (≥2 characters) and `type=all\|users\|requests\|shifts`; up to 10 rows per group; `403` when the account has no user profile                     |
| `GET /api/branches`                  | session           | `branches`                    | Branch list in creation order (oldest first, the order of the asset numbers the branches hold — SCRUM-67), including the GPS geofence (`latitude`, `longitude`, `attendance_radius`) |
| `POST /api/branches`                 | session + role    | `branches`                    | Body `{ name, address?, manager_id?, latitude?, longitude?, attendance_radius? }` → `201`; `400` when the coordinates or radius are invalid, or `manager_id` names an account that is not a `MANAGER` (SCRUM-63: the owner and an employee may not head a branch); writes need `branch:manage` (`OWNER` only), which RLS repeats. The branch also receives its own `asset_prefix` (SCRUM-67), the number inside its facilities' tags; `409` means another branch claimed that number in the same instant — save again |
| `PUT /api/branches/{id}`             | session + role    | `branches`                    | Replaces the editable fields of one branch: `branch:update` — the organization's `OWNER` or the chi nhánh trưởng of that very branch (SCRUM-61), so editing another branch is `403`. Only the `OWNER` may change `manager_id`. `400` when `id` is not a UUID, `manager_id` names no account in the caller's organization, or it names an `EMPLOYEE` or the `OWNER` (only a `MANAGER` heads a branch — SCRUM-63 — and the picker does not offer the others), `404` when the branch is missing or not editable by the caller |
| `DELETE /api/branches/{id}`          | session + role    | `branches`                    | Removes a branch; owner only (`branch:manage`). `409` while the branch still holds bảng công / ca làm việc / thiết bị / doanh thu — the sentence names the counts to move or remove first, because `attendance`, `shift_assignments` and `facilities` cascade and `daily_revenue.branch_id` has no foreign key. `404` when missing or not deletable |
| `GET /api/geo/reverse`               | session           | Nominatim → Photon (OpenStreetMap) | `?latitude=&longitude=` → `{ address }` for the branch form's address field; `400` when a coordinate is missing, out of range or outside Vietnam. Two keyless providers over the same OpenStreetMap data are tried in order (SCRUM-64), so `503` means **both** failed (addresses come from the same project as the map tiles; a filtered DNS that blackholes `*.openstreetmap.org` — which also blanks the branch map tiles — is the case the second provider covers) |
| `GET /api/users`                     | session + role    | `users`                       | `?id=<uuid>` → `{ id, full_name, role, branch_id }` (`404` when unknown); without `id` → the staff directory including `is_active` and `branch_id`, `403` unless the caller holds `directory:view` (`OWNER`/`MANAGER`) |
| `PATCH /api/users/{id}`              | session + role    | `users`                       | Body `{ role, is_active, branch_id? }` → the updated staff member; `403` unless the caller holds `staff:manage` (`OWNER` only), and nobody may change their own role or deactivate themselves. `branch_id` (SCRUM-63) attaches the account to a branch — omitted keeps the current one, `null` tháo gán, `400` when it names no branch in your organization or when the account is the organization's `OWNER` (the owner stands above every branch and is never attached to one). An employee with no branch reads no branch-scoped row and cannot file a đơn |
| `POST /api/organizations`            | session           | `organizations`               | Body `{ name }` → `201`; creates the caller's organization and makes them its `OWNER` (registering grants nothing); `409` when they already belong to one |
| `GET /api/organizations/current`     | session           | `organizations` + `users`     | `{ organization, code, member_count, pending_invite_count }`; `organization` is null while the caller has none, and `code` is null unless they are the `OWNER` (RLS keeps it) |
| `PATCH /api/organizations/current`   | session + role    | `organizations`               | Body `{ name?, rotate_code? }` → the updated summary; both actions need `organization:manage` (`OWNER` only), rotating the join code through `regenerate_organization_code` |
| `POST /api/organizations/join`       | session           | RPC `join_organization`       | Body `{ code }` → the summary. **Two factors**: the code must match *and* the caller's email must be on that organization's register; an outsider with the code gets `403`, ten failed attempts per hour get `429`, already being in an organization gets `409` |
| `GET /api/organizations/invites`     | session + role    | `organization_invites`        | The register of accounts (`invite` = asked an existing account, `provisioned` = created with a temporary password); `403` unless the caller holds `organization:manage` (`OWNER` only) |
| `POST /api/organizations/invites`    | session + role    | `organization_invites`        | Body `{ email, full_name?, role? }` → `201`; `role` is capped at `MANAGER` (an invite never mints an `OWNER`), `409` when the address is already listed |
| `DELETE /api/organizations/invites/{id}` | session + role | `organization_invites`        | Withdraws an unclaimed invite (`404` for another organization's row, `400` for a non-UUID id) |
| `GET /api/organizations/accounts`    | session + role    | Edge Function probe           | `{ available }` — whether the `staff-account` Edge Function is deployed, so the screen can hide a form that would always fail; `403` unless the caller holds `organization:manage` (`OWNER` only) |
| `POST /api/organizations/accounts`   | session + role    | Edge Function (service role)  | Body `{ email, password, full_name?, role? }` → `201`; creates a real Supabase Auth account with the owner-chosen temporary password, adds it to the register and flags `must_change_password`; `503` when the function is not deployed, `409` when the email exists |
| `POST /api/organizations/accounts/password` | session + role | Edge Function (service role) | Body `{ user_id, password }` → replaces a member's temporary password; the function refuses any account outside the caller's organization (`403`) |
| `POST /api/auth/change-password`     | session           | Supabase Auth + `complete_password_change` | Body `{ password }` → the caller's own new password (no service role) and clears `must_change_password`, which is what the `/change-password` gate reads |
| `POST /api/chat/ask`                 | session           | Gemini + vector RPCs          | Body `{ question }` → `{ answer, sources[] }`; answers only from retrieved internal documents                                                        |
| `GET /api/chat/sources`              | session           | `company_documents` + `user_contracts` | What the assistant can read: `{ companyDocuments, userContracts }`, each `{ totalChunks, documents[], truncated }` — the corpus check behind the Trợ lý AI screen's "Nguồn tri thức" panel |
| `GET /api/swagger`                   | —                 | generated spec                | Serves `public/swagger.json`                                                                                                                         |

Status conventions: `400` invalid input, `401` no session, `403` not allowed (for example a role that
cannot approve), `404` missing row, `409` duplicate or conflicting state.

### Interactive documentation

- `/api-docs` — Swagger UI. Because it runs in the browser it reuses your Supabase session cookie, which
  makes it the easiest way to exercise the authenticated endpoints.
- `GET /api/swagger` — the raw OpenAPI 3 document.
- `public/swagger.json` is generated by `scripts/generate-swagger.ts` (wired to `predev`/`prebuild`), and
  that script exits `1` when no paths are found — so a malformed `@swagger` block stops `dev` and `build`.
  Never edit the file by hand; regenerate it.

### Example requests

```bash
# Authenticated calls need the Supabase session cookie: sign in at /login, or use /api-docs,
# which reuses your browser cookie.
# Declare opening revenue for a branch:
curl -X POST http://localhost:3000/api/revenue/open \
  -H "Content-Type: application/json" -b "<supabase-auth-cookie>" \
  -d '{"branch_id":"11111111-1111-1111-1111-111111111111","open_amount":1500000}'

# Close the shift — the response adds the difference between closing and opening amounts:
curl -X PUT http://localhost:3000/api/revenue/close \
  -H "Content-Type: application/json" -b "<supabase-auth-cookie>" \
  -d '{"branch_id":"11111111-1111-1111-1111-111111111111","close_amount":2200000,"close_note":"Đối soát cuối ca"}'

# Monthly revenue report for one branch:
curl "http://localhost:3000/api/revenue/report?branch_id=11111111-1111-1111-1111-111111111111&period=month&date=2026-09-29" \
  -b "<supabase-auth-cookie>"

# Quick search across users, requests and shifts:
curl "http://localhost:3000/api/search?q=ca%20sang&type=all" -b "<supabase-auth-cookie>"

# Ask the AI assistant about an internal policy:
curl -X POST http://localhost:3000/api/chat/ask \
  -H "Content-Type: application/json" -b "<supabase-auth-cookie>" \
  -d '{"question":"Chính sách nghỉ phép năm của công ty là bao nhiêu ngày?"}'
```

Every endpoint above requires a session cookie, and the data is real: the last mock screen (trạng thái
nhân viên) moved to the `get_employee_status` RPC, and `lib/mock/adminStore.ts` was deleted with it.

```bash
# Submit one's own request (any role; it reaches the approval queue as PENDING):
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" -b "<supabase-auth-cookie>" \
  -d '{"branch_id":"22222222-2222-4222-8222-222222222222","request_type":"Nghỉ phép","title":"Xin nghỉ phép ngày 12/10","content":"Nghỉ 1 ngày, đã nhờ bạn đổi ca."}'

# Approve a staff request (OWNER/MANAGER — everyone else gets 403):
curl -X PATCH http://localhost:3000/api/requests/11111111-1111-4111-8111-111111111111/review \
  -H "Content-Type: application/json" -b "<supabase-auth-cookie>" \
  -d '{"status":"APPROVED"}'
```

## Roles & access (SCRUM-59)

Three levels, and one table that drives every layer:

| Role       | What it is                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `OWNER`    | Owns the organization: its settings (name, join code), its register of accounts, staff roles and branches.      |
| `MANAGER`  | Runs the day-to-day operation: schedule, timesheet review, requests, revenue, facilities.                       |
| `EMPLOYEE` | Their own shifts, timesheet and requests. (`CHU` was the pre-SCRUM-59 spelling of `MANAGER`; the app still reads it and maps it through `normalizeRole`, which is what makes the rename a single-step deploy.) |

`lib/accessPolicy.ts` holds the capability table and the screen-to-capability map, and five layers read it:

1. `proxy.ts` redirects a deep link the role may not open (`canAccessScreen`) to `firstAccessiblePath`,
2. `components/Sidebar.tsx` renders only the links the role may open,
3. a page hides a control the role may not use behind `useProfile().can("…")` — no "Thêm chi nhánh" for a
   manager on `/branches`, no Duyệt/Từ chối for an employee on `/requests`,
4. a route handler refuses the call with `403` before the use case runs (`requireCapability("…")` from
   `app/api/_lib/requireCaller.ts`),
5. RLS repeats the rule in the database, which is the boundary that actually holds
   (`is_organization_manager()` / `is_organization_owner()` / `heads_branch()`, plus SCRUM-60's per-role
   read scope).

| Capability                                                              | `EMPLOYEE` | `MANAGER` | `OWNER` |
| ----------------------------------------------------------------------- | :--------: | :-------: | :-----: |
| `dashboard:view`, `notification:view`, `knowledge:view`                  | ✓          | ✓         | ✓       |
| own `request:view`, `schedule:view` (RLS narrows rows)                    | ✓          | ✓         | ✓       |
| `attendance:checkin` — clock in / clock out; the organization's `OWNER` never does (SCRUM-68) | ✓ | ✓ | — |
| `attendance:view` — the Bảng công review screen, a manager's screen since SCRUM-68 | —    | ✓         | ✓       |
| `security:manage` — one's own passkey / Face ID quick login (SCRUM-79)    | ✓          | ✓         | ✓       |
| `revenue:manage`, `report:view`, `employee-status:view`                  | —          | ✓         | ✓       |
| `request:review`, `schedule:manage`, `attendance:review`, `facility:manage`, `branch:view`, `branch:update`, `directory:view` | — | ✓ | ✓ |
| `branch:manage` (create, delete), `staff:manage`, `organization:manage`   | —          | —         | ✓       |

### Branch scope: a chi nhánh trưởng manages their own branch (SCRUM-61)

The capability table above says a `MANAGER` may run the operation; **which** branch is decided by
`branches.manager_id`. A manager is the *chi nhánh trưởng* of the branch that names them there, and
they may only write that one — `OWNER` keeps working across every branch:

| Layer                | What it does                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lib/domain/branchScope.ts` | The rule in one place: `canManageBranch(branch, viewer)` / `defaultBranchId(branches, viewer)`, read by the use cases **and** the screens (so the two cannot drift). |
| Route handlers       | `requireCapability(…)` first (`revenue:manage`, `schedule:manage`, `attendance:review`, `facility:manage`, `branch:update`), then the use case. |
| Use cases            | `assertBranchManagedBy(branchRepository, branchId, caller)` (`lib/usecases/branchScope.ts`) answers `403` for another branch instead of letting RLS silently match no row — applied to revenue open/close, schedule write/update/delete, attendance correct/verify/complaint (the manager path), facility write/update/delete, branch update and request review. |
| Database             | `public.heads_branch(uuid)` replaces `is_organization_manager()` in the write policies of `branches`, `daily_revenue`, `shift_assignments`, `attendance`, `facilities` and `requests`; `branches_guard_manager_change` keeps `manager_id` an owner decision. |
| Screens              | Pickers whose value is the *target of a write* (revenue, the schedule and facility modals) gray out — `disabled` + "— chỉ xem" — every branch the caller does not head, and open on their own; row actions outside the scope read **Chỉ xem**. Read filters stay usable: SCRUM-60 deliberately lets a manager read the whole organization. |

Deleting a branch is owner-only and refuses while the branch still holds data (`409`, with the counts);
`branches_guard_delete` repeats that check in the database, because `attendance`, `shift_assignments` and
`facilities` cascade and `daily_revenue.branch_id` has no foreign key at all.

Deploy order matters: `SCRUM-59_role_model.sql` first, then this app **with** the redeployed
`staff-account` Edge Function (it accepts `EMPLOYEE`/`MANAGER` and still understands the old `CHU`), then
`SCRUM-60_role_read_scope.sql`, then `SCRUM-61_branch_scope.sql` (together with the app build that ships
it — the script alone only makes branch writes stricter).

### Sign-in security: Face ID / passkey quick login (SCRUM-79)

A passkey is a WebAuthn credential, so "Face ID" here is the device's own Face ID (iPhone / Mac), Windows
Hello (a PC) or a fingerprint — not a face scanner inside this app. **No biometric data is stored
anywhere:** the private key stays on the device and Supabase Auth keeps only its public half, so there is
no template and no new table (the credential lives in `auth.*`, which is why this feature needs no SQL).

| Where          | What                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/security` (Bảo mật) | Turn it on for the device you are using: add a passkey (`registerPasskey()`), rename it (`iPhone của An`), delete a device you no longer have. A blank name falls back to the device label. |
| `/login`       | "Đăng nhập bằng Face ID" under the password form (`signInWithPasskey()`). The password path stays, so a lost device never locks an account out.           |
| Every role     | `security:manage` sits in `EMPLOYEE_CAPABILITIES`, so `OWNER`, `MANAGER` and `EMPLOYEE` each manage their own passkeys — GoTrue scopes every passkey call to the caller, so there is no row for RLS to decide. |

Two prerequisites, or the button never works: **Dashboard → Authentication → Passkeys** (enable, set the
Relying Party display name and an **RP ID that is the deployed bare domain**; `localhost` works for dev)
and **HTTPS** in production — WebAuthn has no secure-context fallback, so an IP-address host is out.
Passkeys are **experimental** in Supabase and **per device** (enrolling a phone does not enable a laptop).
Requiring a fresh Face ID prompt before check-in is the planned SCRUM-80; nothing enforces it yet.

## Database & Supabase

The schema lives as plain SQL in `supabase/sql/` and is applied **by hand** in Supabase Dashboard → SQL
Editor (there is no migration runner or Supabase CLI here). Apply it in this order:

| #   | Script                              | What it creates                                                                                                                                                                                             |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `SCRUM-39_daily_revenue.sql`        | `public.daily_revenue` (`id`, `branch_id`, `open_amount`, `created_at`, `created_by`), a unique index allowing one opening declaration per branch per business day (UTC+7), plus RLS select/insert policies |
| 2   | `SCRUM-40_update_revenue.sql`       | The closing columns (`close_amount`, `close_note`, `close_image_url`, `closed_by`, `closed_at`) and `audit_log jsonb`, plus an update policy requiring `closed_by = auth.uid()`                             |
| 3   | `SCRUM-44_revenue_report.sql`       | RPC `get_revenue_report(p_branch_id, p_start_at, p_end_at, p_bucket)` aggregating closed shifts into `day`/`month` buckets in Asia/Bangkok                                                                  |
| 4   | `SCRUM-48_notifications.sql`        | `notifications` and `notification_settings` (`UNIQUE (user_id, channel)`), indexes, an `updated_at` trigger and per-user RLS policies                                                                       |
| 5   | `SCRUM-49_quick_search_indexes.sql` | The `pg_trgm` extension plus GIN indexes on `users.full_name`, `requests.request_type`, `requests.status` and `shifts.name` used by the `ILIKE` quick search                                                |
| 6   | `SCRUM-47_branches.sql`             | `public.branches` (name, address, `manager_id`, `latitude`/`longitude`, `attendance_radius` in metres) with idempotent `add column if not exists`, check constraints for the radius bounds and the coordinate pair, plus RLS: read for every authenticated user, write for `OWNER`/`CHU` |
| 7   | `SCRUM-50_user_registration.sql`    | Fills the gaps in the hand-created `public.users`, defaults `role` to `EMPLOYEE`, adds the `on_auth_user_created` trigger (+ backfill) so every auth account gets a profile row, and the narrow `users_select_own` policy that `/api/auth/session` needs |
| 8   | `SCRUM-45_facilities.sql`           | `public.facilities` (per-branch equipment: name, `code`, `category`, `quantity`, `condition`, `last_checked_at`, `note`) with check constraints, indexes on `branch_id`/`condition` and RLS: read for every authenticated user, write for `OWNER`/`CHU` |
| 9   | `SCRUM-30_schedule.sql`             | The `public.shifts` catalogue (columns added if missing + the standard `Ca sáng` / `Ca chiều` / `Ca tối` / `Nghỉ` seeds) and `public.shift_assignments` (one employee × one template × one `work_date`, unique per triple, `status`, `created_by default auth.uid()`) with indexes and the same RLS model |
| 10  | `SCRUM-41_request_review.sql`       | Fills the gaps in the hand-created `public.requests`, adds the `requests_user_id_fkey` foreign key the requester-name join needs (`not valid`, so legacy rows are not re-checked), the `status` check, four indexes and RLS: read for authenticated, insert only your own `PENDING` request, approve/reject for `OWNER`/`CHU` |
| 11  | `SCRUM-21_attendance.sql`           | `public.attendance` (new): giờ vào/ra, GPS điểm chấm công + khoảng cách tới tâm chi nhánh (database tự tính lại từ toạ độ), ảnh xác minh, `status`, khiếu nại và xác minh của quản lý. Constraints (status, distance ≥ 0, ra ≥ vào), 4 indexes, RLS (read for authenticated, insert/update own, update for `OWNER`/`CHU`) plus two triggers: `attendance_guard_self_update` locks the check-in facts for non-managers and `attendance_compute_distance` keeps the stored distance consistent with the stored point |
| 12  | `SCRUM-22_employee_status.sql`      | `users.is_active` (whether an account still works here, because "nghỉ việc" cannot be derived) and the `get_employee_status(p_branch_id, p_work_date)` RPC: one row per person per business day, `security invoker` so the underlying RLS still filters, executable by `authenticated` only |
| 13  | `SCRUM-23_attendance_review.sql`    | The Bảng công review columns on `public.attendance`: `corrected_by`/`corrected_at`/`correction_reason` (a CHECK keeps the reason and the timestamp together, so a correction is always auditable) and the khiếu nại lifecycle `complaint_status` (`OPEN`/`RESOLVED`, existing complaints backfilled to `OPEN`), `complaint_resolved_by`/`complaint_resolved_at` + an index on the status. No RLS change: `attendance_update_managers` already permits it |
| 14  | `SCRUM-24_staff_admin.sql`          | Quản lý nhân sự: `users.is_active` (repeated from SCRUM-22 so this script stands alone), the read policy `users_select_authenticated` — the directory is only id, name, role, `is_active` and `created_at`, no salary or contact data — and `users_update_managers` (only `OWNER`/`CHU` may change a role or the employment state; no insert policy, because accounts are created by sign-up) |
| 15  | `SCRUM-51_organizations.sql`        | Tổ chức: `organizations`, `organization_join_codes` (the code sits in its own table because RLS filters rows, not columns — its policy keeps it to `OWNER`/`CHU`), `organization_invites` (the register of accounts, `source` `invite`/`provisioned`), `organization_join_attempts` (audit + the 10-per-hour throttle), `users.organization_id`, `users.must_change_password`, the helper functions `current_organization_id()` / `is_organization_manager()` and the `security definer` RPCs `create_organization` / `join_organization` / `regenerate_organization_code` / `complete_password_change`. Also narrows `users_select_authenticated` and `users_update_managers` to the caller's organization, which is what stops the schedule/requests/attendance embeds from mixing tenants |
| 16  | `SCRUM-53_tenant_scope.sql`         | `organization_id` on the operational tables (`branches`, `shifts`, `shift_assignments`, `attendance`, `requests`, `facilities`, `daily_revenue`) with `default public.current_organization_id()` so the mobile check-in keeps inserting unchanged, an index per table, every policy rewritten to add the organization predicate — the original conditions are kept verbatim, a rewrite must never end up looser — plus a backfill that assigns the pre-existing rows when exactly one organization exists, and a verification query block. Notifications are left alone: `user_id = auth.uid()` is already narrower |
| 17  | `SCRUM-54_fix_organization_policy_recursion.sql` | Makes `current_organization_id()` and `is_organization_manager()` **`security definer`**. Both read `public.users` and the `users` policies call them, so as `security invoker` the policy re-entered itself on the inner read and every profile read failed with `stack depth limit exceeded` — which is what made `/organization` answer 500 and stopped the post-login `/onboarding` redirect from firing. Safe because each helper answers only about the caller (`where id = auth.uid()`); run it **after SCRUM-51** |
| 18  | `SCRUM-55_schema_gap_fill.sql`      | Gap-fills the three tables that already existed here when SCRUM-41/48 were written, so their `create table if not exists` was a no-op: adds `notifications.body` / `related_entity_type` / `related_entity_id` (copying the hand-made `content` into `body`), gives `notification_settings` its `id` (backfilled, then keyed) plus the `(user_id, channel)` uniqueness the settings upsert conflicts on, restates SCRUM-48's indexes, trigger and five policies idempotently, and adds the `requests_user_id_fkey` foreign key the `requester` embed resolves through. Without it `/api/notifications`, `/api/notifications/settings` and `/api/requests` answer 500 |
| 19  | `SCRUM-56_requests_foreign_key.sql` | Creates `requests_user_id_fkey` (the relationship the `requester:users!requests_user_id_fkey` embed needs — the copy in SCRUM-55 did not land, and `requests` has no foreign keys at all) plus the two `_user_id_fkey` keys SCRUM-48 declares, finishes `notification_settings`' primary key and its `(user_id, channel)` uniqueness, **prints a relkind/constraint report** and ends with `notify pgrst, 'reload schema'`. Read the Messages tab: every failure is caught and reported with the database's own error text instead of stopping the script |
| 20  | `SCRUM-57_vietnam_bounds.sql`       | Constraint `branches_vietnam_bounds_check`: a branch's `latitude`/`longitude` must sit inside Vietnam's envelope (8.5436–23.3883° N, 102.0967–109.4944° E) or both be `null`. An envelope alone would still accept a point in Laos or in the sea, so the API parser and the branch map picker additionally test the real land outline from `lib/geo/vietnamOutline.ts` via `isInsideVietnam` (point-in-polygon + a 2 km coastal band, because Natural Earth's own coastlines are generalised by up to ~1.7 km) — the constraint is the backstop for writes that bypass the app |

| 21  | `SCRUM-58_shift_catalogue.sql`      | Refills the `public.shifts` catalogue, which SCRUM-53 scoped per organization while SCRUM-30's seeds had been written with `organization_id = null`: adopts those pre-organization templates when the project has exactly one organization, inserts the standard `Ca sáng` / `Ca chiều` / `Ca tối` / `Nghỉ` for every organization that is missing any of them (guarded per `(organization_id, name)`, so re-running only fills gaps), and adds an `after insert` trigger on `public.organizations` so each **future** organization is seeded on creation. Without it the "Ca làm việc" picker on `/schedules` lists nothing |
| 22  | `SCRUM-59_role_model.sql`           | Mô hình quyền ba cấp: renames `CHU` → `MANAGER` in `users` and `organization_invites` (and rewrites `organization_invites_role_check` to `('EMPLOYEE','MANAGER')`, which would otherwise reject every manager invite), adds `is_organization_owner()` as `security definer`, and rewrites the organization's own policies — `organizations`, `organization_join_codes`, `organization_invites`, `organization_join_attempts` — to that owner check. Each policy is re-created from its previous definition so no original condition is dropped, and the script ends with a report of every policy mentioning the role helpers. Run it **before** deploying the app build that sends `MANAGER` |
| 23  | `SCRUM-60_role_read_scope.sql`      | Read scope per role: inside an organization an employee now reads only their own rows — `attendance`, `requests`, `shift_assignments`, `daily_revenue`, `facilities` — while `OWNER` and `MANAGER` read the organization's. `get_revenue_report()` and `get_employee_status()` are `security invoker`, so they follow these policies without a change of their own, and `branches` / `shifts` keep their org-wide SELECT because the mobile check-in needs the geofence and the shared schedule. Run it **after** the app deploy |
| 24  | `SCRUM-61_branch_scope.sql`       | Branch scope: `public.heads_branch(uuid)` — a `security definer` helper that answers whether the caller is the chi nhánh trưởng of a branch — replaces `is_organization_manager()` in the write policies of `branches`, `daily_revenue`, `shift_assignments`, `attendance`, `facilities` and `requests`, so a `MANAGER` writes only the branch they head while `OWNER` keeps the whole organization. Adds the owner-only `branches` DELETE policy (there was none, so deleting was impossible) plus two guards: `branches_guard_manager_change` (`manager_id` stays an owner decision) and `branches_guard_delete` (a branch that still holds bảng công / ca / thiết bị / doanh thu cannot be deleted, mirroring the API's `409`). Reads are untouched: SCRUM-60 stays as it is |
| 25  | `SCRUM-62_request_type_constraint.sql` | Reconciles the hand-made `requests_request_type_check` with the app's vocabulary. The constraint was created in the dashboard before any ticket and PostgREST never exposes a check definition, so `POST /api/requests` could only answer `500 ... violates check constraint "requests_request_type_check"`. The script **prints the definition it replaces** (Messages tab), drops it and recreates it for `('Nghỉ phép','Đổi ca','Điều chỉnh công','Khác')` — the values `REQUEST_TYPES` in `lib/domain/entities/RequestEntity.ts` sends, because `request_type` is stored and displayed verbatim. Keep the two lists identical | 
| 26  | `SCRUM-63_employee_branch.sql`      | Mỗi nhân viên thuộc một chi nhánh (employee branch scope): adds `users.branch_id` (nullable, `on delete set null`, indexed) and `public.current_branch_id()` (`security definer`, like the other policy helpers), then narrows the **employee** half of the read policies on `branches`, `requests`, `attendance` and `shift_assignments` to `branch_id = current_branch_id()` while `is_organization_manager()` keeps a manager's organization-wide read; `requests_insert_own` and `attendance_insert_own` get the same test, so an unassigned account (`branch_id = null`) files no đơn and checks in nowhere. Run it **before** deploying the build that carries it: `GET /api/auth/session` selects the column |
| 27  | `SCRUM-68_attendance_self_checkin.sql` | Keeps the owner out of timekeeping (SCRUM-68): re-creates `attendance_insert_own` from SCRUM-63's definition plus `and not public.is_organization_owner()`, so even a hand-written PostgREST insert as the owner is refused. Every original clause (`employee_id = auth.uid()`, `organization_id = current_organization_id()`, the manager branch bypass) is kept verbatim, and only the INSERT policy changes — a legacy owner row stays readable and editable by them. Run it **after SCRUM-59/63**; the app gate is `attendance:checkin`, and the script ends with a `pg_get_expr(polwithcheck, …)` query that prints what the policy now says |
| 28  | `SCRUM-69_attendance_worked_time.sql` | Giờ làm không tính khoảng nghỉ (SCRUM-69): adds the derived columns `worked_seconds` (accumulated time actually worked) and `resumed_at` (when the current segment began after a "Vào ca lại"), backfills the existing closed rows from their two timestamps, and adds the `before insert or update` trigger `attendance_track_worked_time` that maintains both — each check-out adds only the segment that began at the check-in or at the last re-open, a re-open starts a new segment, and a manager's "Sửa giờ" (`corrected_at` changed) recomputes the total from the corrected pair. Both columns are copied back from the old row on every other update, so no client can write them. **Run it before deploying the build that carries it**: `GET /api/attendance` selects the new columns |
| 29  | `SCRUM-70_notifications_fanout.sql` | The writer SCRUM-48 never had: `notify_user` / `notify_users` (the one INSERT, gated by the recipient's `in_app` switch and a 5-minute dedupe window), the recipient selectors (`organization_owner_ids`, `branch_manager_ids`, `organization_member_ids`, `branch_organization`), a `normalized_role` mirror of `lib/domain/roles.ts` and the Vietnamese label helpers, plus two indexes for the new `type` filter and the dedupe. Every helper is `security definer` and **revoked** from `public, anon, authenticated`: Postgres grants EXECUTE to PUBLIC and PostgREST exposes `public` functions as RPCs, so without the revoke a member could forge a notification. Run it first — 71 and 72 depend on it |
| 30  | `SCRUM-71_notifications_operation_events.sql` | The operation triggers: `daily_revenue` (khai báo đầu ca / chốt ca, with its own `REVENUE_DIFF` type when the difference is not zero), `requests` (gửi đơn → the queue's owners; duyệt/từ chối → the requester, plus the chủ sở hữu when a manager decided), `shift_assignments` (gán/đổi/xoá/ngày nghỉ → the employee) and one `attendance` trigger for the exceptions only (đi muộn, ngoài vùng, về sớm, vào ca lại, khiếu nại, đã xử lý khiếu nại, sửa giờ, xác nhận). `notification_is_late` / `notification_is_early_leave` re-derive the verdict from `check_in_at` + the ca's hours — never from `attendance.status`, which is what a *client* wrote — and mirror `CHECK_IN_GRACE_MINUTES` (5) through `attendance_grace_minutes()` |
| 31  | `SCRUM-72_notifications_admin_events.sql` | The administration triggers: `users` (tài khoản có mật khẩu tạm, gia nhập tổ chức, đổi vai trò, đã nghỉ, đổi chi nhánh làm việc), `branches` (tạo/sửa/xoá, giao hoặc thu hồi phụ trách), `facilities` (tạo/sửa/xoá, chuyển chi nhánh kèm mã tài sản mới), `facility_categories`, `organization_invites` (only an invitation to an email that already has an account) and `organizations` (đổi tên). Creating an organization and rotating the join code deliberately notify nobody — the caller is the only audience |
| 32  | `SCRUM-74_notifications_legacy_columns.sql` | The legacy `notifications` shape must accept the rows the fan-out writes. `public.notifications` was hand-made before SCRUM-48 and SCRUM-55 kept its old message column `content`; on that table `content` was declared `NOT NULL`, and the SCRUM-70 writer fills `body` — so every INSERT failed with `23502` **inside an AFTER trigger**, which rolled the business statement back (creating or deleting a ca answered `500 Unable to create/delete the shift assignment.`). The script reports the table's mandatory columns, drops the `NOT NULL` on the legacy `content` (keeping it, with an empty default), re-lists any column that is still mandatory-without-default, performs a real self-deleting insert as the definer (`OK`/`FAILED` with the database's own reason) and prints the table's owner next to `notify_user`'s owner, which is what a `FAILED` usually means. Run it **before** SCRUM-73 |
| 33  | `SCRUM-73_notifications_resilience.sql` | Makes the inbox unable to break a business write: re-creates `notify_user` with an `exception` block around its INSERT (PL/pgSQL's implicit savepoint rolls the notification back alone, so the shift assignment, the revenue close or the đơn that fired it still commits) and logs `notify_user: could not store …` as a WARNING; widens `notification_amount_label` to `FM999,999,999,999,999,999` so no `numeric(14,2)` revenue figure can make `to_char` raise |
| 34  | `SCRUM-76_notifications_never_break_business_writes.sql` | The generalised repair of the same trap, and **one paste instead of 74 + 73**: it relaxes *every* mandatory-without-default column of `public.notifications` (identified by a loop over `information_schema`, because a later dashboard edit can add another one — `content` was only the first), restates the guarded `notify_user` and the wide `notification_amount_label`, verifies with a real self-deleting insert (`OK`/`FAILED` plus the database's own reason), prints the owners of the table and of the writer, and ends with a read-only diagnostic of every branch whose `manager_id`/`organization_id` disagree. A `500 Unable to declare opening revenue.` / `Unable to create the shift assignment.` for a manager (while the owner can do the same thing) is this trap — the AFTER trigger rolls the business write back with the notification — and not a permission problem |
| 35  | `SCRUM-77_notification_tables_write_path.sql` | The other half of the same trap, on the second hand-made table: `public.notification_settings` predates SCRUM-48, so the `enabled boolean not null default true` / `updated_at timestamptz not null default now()` it declares never landed and SCRUM-55/56 fixed only the surrogate key. The drawer's upsert writes `user_id, channel, enabled` and nothing else — `updated_at` is only set by the `before update` trigger, which does not run on INSERT — so **`500 Unable to update notification settings.` for every role, which is a table constraint, not a permission**. The script restores the declared defaults, loops over any other mandatory-without-default column, de-duplicates and re-asserts the primary key + the `(user_id, channel)` unique index PostgREST's `on_conflict` needs (with a schema reload), restates the three per-user policies, runs the exact upsert and rolls it back (`OK`/`FAILED` + SQLSTATE), adds the same declared defaults to `notifications` (`type`, `is_read`, `created_at` — SCRUM-76 §2 deliberately skipped those three), and compares what the drawer stored against what `notification_in_app_enabled()` answers, so a mute that never mutes (a definer whose owner is not the table's owner) is visible |
Tables the API touches: `users` (its `role` gates every management action — `OWNER`/`MANAGER`), `requests`, `shifts`
(the template catalogue), `shift_assignments` (the schedule), `attendance`, `daily_revenue`, `branches`,
`facilities`, `notifications`, `notification_settings`.

The AI assistant additionally depends on `match_company_documents` / `match_user_contracts` and their
embedding tables. Those objects are not covered by the scripts in this repository, so the chat endpoint
only works against a Supabase project where they already exist.

### The `staff-account` Edge Function (SCRUM-52, optional)

Creating a Supabase Auth account *for somebody else* needs the service-role key, which this app
deliberately does not have. That single capability therefore lives in an Edge Function:

- **Source (deployed by hand):** `supabase/functions/staff-account/index.ts`. There is no Supabase CLI or
  Docker in this repository, so deploy it from the Dashboard: **Edge Functions → Create a new function →
  name it `staff-account` → paste the file → Deploy**. Keep JWT verification **ON**; `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` are supplied by the platform, and no secret is added to this app.
- **Why it looks "wrong" in an editor:** that folder is Deno, not Node, so the root `tsconfig.json`
  excludes `supabase/functions/**` from `npx tsc --noEmit` and the app's lint/type gates do not cover it
  (`supabase/functions/deno.json` marks it as a Deno project). An editor without the Deno extension
  reports `Cannot find name 'Deno'` and `Cannot find module 'jsr:@supabase/supabase-js@2'` for it — those
  are not real errors. Install the Deno VS Code extension (or run `deno check
  supabase/functions/staff-account/index.ts`) and they stop; the Edge runtime bundles the file at deploy.
- **How it is called:** `POST /api/organizations/accounts` forwards the *caller's* access token, so the
  function authorizes the user (it re-reads their profile and requires the organization's `OWNER`)
  rather than trusting this app. The URL is derived from `NEXT_PUBLIC_SUPABASE_URL` as
  `…/functions/v1/staff-account`; set `STAFF_ACCOUNT_FUNCTION_URL` to override it if you rename the
  function.
- **Behaviour without it:** `GET /api/organizations/accounts` answers `{ available, reason, detail }`
  where `reason` is one of `ready`, `not_deployed`, `unauthenticated` (the function refused the session
  token — keep "Verify JWT" on), `not_allowed` (this account is not the organization's `OWNER`) or
  `misconfigured` (deployed but answering 5xx, e.g. missing secrets). The `/organization` screen shows the
  instruction that matches the reason instead of a form that would always fail, and the invite path
  (`POST /api/organizations/invites`) still onboards people.
- **What it does:** creates the account with `email_confirm: true` and the owner-typed temporary
  password, sets `must_change_password`, and writes the register row (`source = 'provisioned'`). The
  password is never stored or logged. It also serves `action: "reset_password"` for a member of the
  caller's own organization. Guardrails: field validation, JWT verification, the organization/role
  check, and a 20-accounts-per-organization-per-hour limit. It refuses to hand over a login that cannot
  work — if the `on_auth_user_created` trigger from `SCRUM-50_user_registration.sql` is missing, the
  account would have no `public.users` row, so the function answers `500` telling you to apply that
  script rather than returning `201`.

Rules for new database work:

- Add a **new** `supabase/sql/SCRUM-<n>_<name>.sql`; never edit a script that has already been applied.
- Keep scripts idempotent (`create table if not exists`, `drop policy if exists` before `create policy`),
  enable RLS on every new table and grant the narrowest policy (`auth.uid()` based).
- Timestamps are stored and served in **UTC**, while the business day is computed in **Asia/Bangkok
  (UTC+7, no DST)** — see `lib/usecases/businessDay.ts`. The unique index on `daily_revenue` uses the
  Bangkok date too, so a duplicate `409` can come from the database rather than from the use case.

## AI assistant (Trợ lý AI)

`POST /api/chat/ask` is a retrieval-augmented flow:

1. `GeminiLLMService.createEmbedding` embeds the question with `gemini-embedding-001`, pinning
   `outputDimensionality: 768` so the vector matches the existing `vector(768)` columns.
2. `SupabaseVectorSearchRepository` runs `match_company_documents` and `match_user_contracts` in parallel
   (five chunks each), keeping personal contracts scoped to the calling user. Both RPCs take
   `match_threshold` with **no default**, so the argument is mandatory — omitting it fails with
   `PGRST202` rather than returning an empty list.
3. The merged context goes to `gemini-3.5-flash`, which must answer **only** from that context, cite the
   source document, and return a fixed "không có thông tin" sentence when nothing matches.

The models are pinned, not aliased: `text-embedding-004` and `gemini-1.5-flash` now answer `404`
("no longer available") and the `gemini-flash-latest` alias measured 2/4 calls failing with `503
high demand`. Verify a candidate with `GET /v1beta/models?key=…` before switching.

**Loading documents:** put `.md` / `.txt` files in `docs/` — one file per document, and the first `#`
heading becomes the citation title — then run `npx tsx scripts/ingest-knowledge.ts`. It chunks the text
(`--max-chars`, default 1000, split on blank lines), embeds every chunk with `gemini-embedding-001` at
768 dims, and writes `supabase/sql/knowledge_seed.sql` to paste into the SQL Editor: this repo holds no
service-role key on purpose, so the privileged write happens in the editor, where `postgres` owns the
tables. Re-running is safe — the generated script deletes exactly the titles present in the source
folder before inserting, so edits replace rather than duplicate. Contracts are per person:
`npx tsx scripts/ingest-knowledge.ts --table user_contracts --user-id <uuid> --source docs/contracts`.
Details and conventions: `docs/README.md`.
(company-wide, columns `id, content, embedding, title, created_at`) and `user_contracts` (rows scoped to
the caller by `user_id`, same columns). `GET /api/chat/sources` reports both, and the screen's "Nguồn
tri thức" panel renders it: total chunks plus the document titles with their chunk counts. When both are
empty every question legitimately answers "Tôi không có thông tin về vấn đề này…", because the prompt
forbids answering outside the retrieved context. Nothing in this repo creates or fills those tables, so
an empty corpus is a data task: chunk the source text, embed each chunk with `gemini-embedding-001` at
**768 dims** (`outputDimensionality: 768`, matching the vector columns the old model produced) and
insert `{ content, title, embedding }`. Check the real column types and row counts in the SQL Editor —
`select count(*) from public.company_documents;` and
`select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.company_documents'::regclass and attname = 'embedding';`.

Model names, the prompt and that fallback sentence live in
`lib/infrastructure/GeminiLLMService.ts`; changing them is a product decision (it costs money and changes
answers).

## Scripts

| Command                               | What it does                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm install`                         | Install dependencies                                                               |
| `npm run dev`                         | Dev server on <http://localhost:3000> (`predev` regenerates `public/swagger.json`) |
| `npm run build`                       | Production build (`prebuild` regenerates the spec first)                           |
| `npm start`                           | Serve the production build                                                         |
| `npm run lint`                        | ESLint over the repo (see the status note below — currently not green)             |
| `npx tsc --noEmit`                    | Typecheck — the gate that currently passes                                         |
| `npx tsx scripts/generate-swagger.ts` | Regenerate `public/swagger.json` manually                                          |

There is **no test runner** in this repository, so "verified" means: typecheck, targeted lint on the
files you touched, and exercising the endpoint or page — plus `/api-docs` when you add a route.

## Contributing

- `AGENTS.md` (imported by `CLAUDE.md`) is the single source of truth for conventions and boundaries —
  read it before changing code.
- Keep the layering intact: route handler → use case → repository. Business rules never live in a route
  handler and database calls never live in a use case.
- Every new API route needs a JSDoc `@swagger` block; add shared response schemas to `lib/swagger.ts`.
- Branches `feat/…` / `fix/…` / `chore/…`, conventional commits, one logical change per commit, and quote
  the SCRUM ticket (`SCRUM-44`) when the work maps to one.

## Current status and limitations

An honest snapshot of what is real and what is still a prototype:

- **Supabase-backed and real:** revenue open / close / report / record list, branches (list, create, update
  with the GPS
  geofence), facilities (per-branch equipment registry), the shift catalogue and the weekly schedule,
  staff requests (list + role-gated approve/reject), attendance (timesheet, geofence verdict, complaints,
  manager verification, and web vào ca / ra ca on `/check-in` — SCRUM-68), the live employee status RPC, notifications and notification settings, quick
  search, user lookup, and the AI assistant endpoint.
- **Face ID / passkey quick login is real; a face-gated check-in is not yet:** `/security` registers the
  passkey and `/login` signs in with it (SCRUM-79), with nothing biometric stored anywhere. Requiring a
  fresh Face ID prompt before `/check-in` writes a row is the planned SCRUM-80.
- **Mobile: the app is usable on a phone now; the widest tables still scroll sideways.** Below 768px
  (`md`) the shell scrolls as a document, the header carries a hamburger that opens the **same** navigation
  list the sidebar shows (`components/navigation.ts` is the single source, so the two cannot drift), the
  theme switch collapses to one cycling button, dialogs become bottom sheets capped at `85dvh`, and every
  input is 16px so Safari does not zoom the page on focus. The wide data tables keep their horizontal
  scroll on purpose instead of a card rewrite, so `/schedules`, `/attendance` and `/reports` are swiped
  sideways on a phone; a sticky first column and per-screen mobile layouts would be the next step.
- **No demo data left:** `lib/mock/adminStore.ts` was deleted together with its last consumer, once
  trạng thái nhân viên moved to `get_employee_status`. Every screen now reads a table or an RPC, and the
  last simulated thing — the header search box — is wired to `GET /api/search` too:
- **Header (`components/Header.tsx`):** the search box calls `GET /api/search` (debounced 250 ms, aborts
  the in-flight request, ↑/↓/Enter/Esc navigation, click-through to `/staff`, `/requests` or
  `/schedules`), the bell links to `/notifications` with an exact unread count
  (`GET /api/notifications?unread=true&page_size=1` → `total`, a filter added for this), and the
  profile block prints the branch under the name for a manager (the chi nhánh they head, from
  `branches.manager_id`) and for an employee (their `users.branch_id`) — never for the owner, who stands
  above every branch (SCRUM-63). The Sáng / Tối / Theo hệ thống switch stores `localStorage["humora-theme"]`
  — below `md` it collapses to one cycling button, because the header has no room for three. The theme is applied as
  `.dark` on `<html>` by an inline script in `app/layout.tsx` (no flash on reload) and re-points
  Tailwind's palette variables in `app/globals.css`, so dark mode covers every screen; components use
  the semantic tokens (`bg-surface`, `bg-app`, `bg-surface-muted`, `bg-canvas`, `bg-primary`,
  `text-primary`, `hover:bg-primary-strong`) instead of hexes.
- **`/chat` (Trợ lý AI)** posts
  the question to `POST /api/chat/ask` and renders the returned `answer` together with the `sources`
  it was built from — each with the document name and the vector search's similarity — so the
  citation panel is real data, not decoration. Conversations live in component state only (the
  endpoint is stateless) and a failed call stays in the transcript with a `Thử lại` button. The five
  navigation screens are wired too: `/` (Tổng quan)
  composes `get_employee_status`, the request queue, today's timesheet and the monthly revenue report;
  `/revenue` opens and closes the business day per branch and lists the last week from `GET /api/revenue`;
  `/reports` is a thin view over `get_revenue_report` with period, branch and date filters; `/notifications`
  reads the paginated feed with server-side filters (`unread` / `read` / `type`), labels every row through
  `lib/domain/notificationCatalog.ts`, links it to the screen it belongs to, marks the inbox read in one
  call (`POST /api/notifications/read-all`) and edits the channel settings; the feed and the header bell
  poll every 30 s, because the rows are written by database triggers while the screen is open (SCRUM-70/71/72).
  `app/branches/page.tsx` is
  wired to `/api/branches` and assigns a `Chi nhánh trưởng` from the SCRUM-24 staff directory
  (`GET /api/users`, `OWNER`/`MANAGER` only — the PII decision is that the directory stays behind that
  gate, so a role without it sees `Đã gán`/`Chưa gán` instead of a name), and its address field is filled by
  reverse geocoding (`GET /api/geo/reverse`) whenever the pin moves or "Lấy vị trí hiện tại" is used.
  The API refuses a `manager_id` it cannot resolve (RLS keeps that lookup inside the organization).
  `app/facilities/page.tsx` and `app/schedules/page.tsx` are wired to their APIs as well.
  `/facilities` reads its "Nhóm thiết bị" options from the organization's catalogue (`GET /api/facility-categories`,
  SCRUM-65) and can add one from the toolbar button or from the little "Thêm" beside the picker in the
  facility modal (`POST /api/facility-categories`), which is what makes a group beyond the six built-ins
  possible without a deploy.
  `/schedules` picks the person with a combobox over the SCRUM-24 directory (`GET /api/users`, which also
  carries `is_active`, so an account that has quit is never offered — an assignment that predates the
  resignation stays editable and is marked `(đã nghỉ)`), lists every active employee on the first click
  and filters as the name is typed (diacritics optional, see `lib/searchText.ts`); `/api/schedules` embeds
  the employee name and shift hours so one request fills the week. The week is rendered as a table — one row
  per ca of the catalogue (earliest first, `Nghỉ` last), seven day columns, one block per assignment — so a
  row/column intersection answers "who covers Ca tối on Thứ 6?", and `+ Thêm` on hover inside a cell is how a
  ca is added to that exact ca and day. Since SCRUM-63 that list holds only
  `EMPLOYEE` accounts of the branches the caller heads (the owner sees every employee), the branch filter
  and the week table with its KPI cards count those branches alone, and the modal's "Chi nhánh" field is no
  longer a picker: the branch follows the chosen employee (`users.branch_id`) and says so, because a ca
  belongs to the branch the person works in. Its "Ca làm việc" picker reads
  `/api/shifts`, whose catalogue is per organization (SCRUM-53): an organization that was never seeded
  sees an explicit "chưa có ca làm việc nào" hint pointing at `supabase/sql/SCRUM-58_shift_catalogue.sql`
  instead of an empty dropdown.
  `app/requests/page.tsx` is wired to the real `requests` table too; it shows the requester name from the
  embedded `users` row, so a missing profile would only cost the name (it is not a PII decision because the
  queue is the point of the screen). `app/attendance/page.tsx` is the review half of attendance: it reads
  `/api/attendance`, judges the check-in point against `branches.attendance_radius`, records khiếu nại and
  lets a manager verify a record. `app/check-in/page.tsx` is the other half since SCRUM-68: the account
  itself clocks in and out there (GPS point, no photo) — the mobile app remains the client that also
  captures the check-in photo.
- **Sign-in and self-registration are real and server-side:** `app/login/page.tsx` and
  `app/register/page.tsx` post to `/api/auth/sign-in` and `/api/auth/sign-up` (route → use case →
  `SupabaseAuthService`), Supabase Auth sets the session cookies, and `proxy.ts` redirects unauthenticated
  page requests to `/login?next=…` while every route handler still answers `401` on its own. The
  `/api/auth/session` route exposes the signed-in profile to the shell header. `lib/publicPaths.ts` is the
  single list of screens that hide the shell (`/login`, `/register`).
- **Registration needs `SCRUM-50_user_registration.sql`.** Sign-up creates the `auth.users` account and the
  trigger creates the matching `public.users` row with the default role `EMPLOYEE`; without that script the
  account exists but has no profile, so `/api/auth/session` answers `404` and the header shows no name. New
  accounts are never privileged — `OWNER`/`MANAGER` is granted by an owner (the promote snippet is at the end of
  the script). If the Supabase project has *Confirm email* enabled, the response carries
  `emailConfirmationRequired: true` and the screen asks the user to open the confirmation link, because no
  session can be created before the address is verified.
- **No tests, no CI, no Docker.** `npx tsc --noEmit` passes; `npm run lint` is currently red with **6,512
  problems (1,088 errors, 5,424 warnings)** on a clean tree (measured on this branch) because the
  committed bundle output under `hr_website/hr_website/.next/**` gets linted. Those are the *bundles*, not
  the app: no page or route carries a lint error any more. Scope lint to the files you changed, and note
  that untracked dev-server output in the same folder inflates the number (it doubled it once) — `git clean
  -f -- hr_website/hr_website` restores the baseline.

## Troubleshooting

| Symptom                                                               | Cause and fix                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.`  | `.env.local` is missing or incomplete — add both Supabase variables                                                            |
| `Missing GEMINI_API_KEY environment variable.`                        | Set `GEMINI_API_KEY`; only `/api/chat/ask` needs it                                                                            |
| "Đăng nhập bằng Face ID" answers `passkey_disabled`                   | Turn passkeys on in Supabase Dashboard → Authentication → Passkeys and set the Relying Party ID to your bare domain             |
| The Face ID button does nothing, or the browser refuses the prompt    | WebAuthn needs HTTPS (or `localhost`) and an RP ID that is a domain — an IP address cannot be one. Passkeys are also per device: check `/security` lists one, and that the OS has a biometric / Windows Hello enrolled |
| Every API call answers `401`                                          | No Supabase session cookie — sign in at `/login` first (pages are redirected by `proxy.ts`, APIs answer JSON `401`)           |
| A page request redirects to `/login` although you expect to be signed in | No valid session cookie: sign in again, or check `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`                 |
| Registered successfully but the header shows no name and `/api/auth/session` answers `404` | The account has no `public.users` row — apply `supabase/sql/SCRUM-50_user_registration.sql` (it backfills existing accounts) |
| `POST /api/auth/sign-up` answers `201` but signing in fails with `email_not_confirmed` | Supabase *Confirm email* is enabled: open the link in the confirmation email first, or turn the setting off in Auth → Providers → Email |
| `POST /api/auth/sign-up` answers `500` on a suspiciously empty project | The `public.users` table is missing or has a `role` enum without an `EMPLOYEE` label — run `SCRUM-50` and adjust that literal |
| `npm run dev` / `npm run build` stops with "Không tìm thấy path nào…" | `scripts/generate-swagger.ts` found zero paths: one of the `@swagger` blocks no longer parses                                  |
| A query returns an empty list or `404` although rows clearly exist    | RLS is filtering by session (`auth.uid()`) — review the policies in `supabase/sql/*.sql`                                       |
| `409` when declaring opening revenue                                  | A declaration already exists for that branch and business day (Asia/Bangkok); the unique index catches concurrent requests too |
| `npm run build` fails while fetching fonts                            | Be Vietnam Pro comes from `next/font/google` and needs outbound network access                                                 |
| Edits on Bảng công / Xếp ca disappear after a reload                  | They should not: both screens write through the API, so a lost change means the request failed — read the rose banner and the server log                                                         |
| `/schedules` shows the shift picker empty                             | `public.shifts` has no templates — run `supabase/sql/SCRUM-30_schedule.sql`, which seeds `Ca sáng` / `Ca chiều` / `Ca tối` / `Nghỉ` |
| Scheduling answers `409`, or `/schedules` shows no employee name      | `409` means the employee already has an overlapping shift that day (by design). A blank name means the `users` SELECT policy hides the profile from the embedded join |
| `/schedules` offers only some branches, and only some people           | Intended (SCRUM-63): the tab is about the branches the caller runs — a manager sees the branches they head, the people scheduled in them, and only `EMPLOYEE` accounts of those branches (a manager and the owner are never offered as somebody to put on a ca). The owner sees the whole organization. Assign a chi nhánh trưởng on `/branches` to widen a manager's view |
| `/schedules` says "Bạn chưa phụ trách chi nhánh nào nên chưa xếp ca được" | The account is a `MANAGER` that heads no branch (`branches.manager_id` is empty), so it has no scope to schedule into — an owner assigns one on `/branches`. An employee whose `users.branch_id` is empty is just as unschedulable: assign their branch on `/staff` (SCRUM-63) |
| Every row of `/api/schedules` has `employee: null`                    | The `users` SELECT policy hides that profile from the embedded join — run `supabase/sql/SCRUM-24_staff_admin.sql`, which creates `users_select_authenticated`                                                  |
| Duyệt đơn answers `403`                                               | The account holds neither `request:review` (`OWNER`/`MANAGER`) nor a `public.users` row — run `SCRUM-50` and promote the account |
| `/requests` lists nothing although rows exist                         | `requests_select_authenticated` (SCRUM-41) is missing, so RLS hides every row from the session                                                                |
| Bảng công is empty                                                    | `public.attendance` does not exist yet — run `supabase/sql/SCRUM-21_attendance.sql`; the rows themselves are written by `/check-in` on the web (SCRUM-68) or by the mobile check-in                             |
| `/check-in` answers `403` for the organization's owner                | By design (SCRUM-68): the owner stands above the operation, so `attendance:checkin` is not one of their capabilities and no "Chấm công" link is rendered for them. `GET /api/attendance` still works, and a hand-written insert is refused too once `SCRUM-68_attendance_self_checkin.sql` is applied |
| `/check-in` answers `409` "no scheduled shift for this business day"  | The employee has no `SCHEDULED` `shift_assignments` row for today (Asia/Bangkok) — schedule the ca on `/schedules`, or check that the assignment was not saved as `LEAVE`/`CANCELLED` |
| `/check-in` answers `409` "already checked in today"                  | A record exists for the same `(employee, work_date, shift_id)` and it is **still open** — the unique index `attendance_employee_shift_day_idx` decides, and two ca of one day are two legitimate rows |
| "Vào ca lại" answers `409` "working time is over"                     | The ca's `end_time` (Asia/Bangkok) has passed, so the check-out stands. Re-opening is only for the window the ca is still running in, which is exactly when a check-out stores `EARLY_LEAVE` — the button is offered on those rows only |
| A ca closed early still reads "Đi muộn"                               | Deliberate: `resolveCheckOutStatus` never overwrites `LATE`, so the lateness the employee arrived with survives the check-out (`EARLY_LEAVE` is only written onto an `ON_TIME` row). A manager corrects the status if the arrival really was on time |
| "Giờ làm" counts the pause between "Ra ca" and "Vào ca lại"                     | `supabase/sql/SCRUM-69_attendance_worked_time.sql` is not applied: the API falls back to the span between giờ vào and giờ ra, which includes the pause. The script adds `worked_seconds` + the trigger that accumulates only the worked segments (and backfills the existing rows) |
| The "Vào ca lại" button does not appear on a ca that was closed early          | It is offered while the ca's working time is still running (`isShiftStillRunning`, the same rule the API applies). A ca whose `end_time` has passed or is missing (`select name, start_time, end_time from public.shifts`) cannot be re-opened — the check-out stands. A LATE row that left early does show it: the button is decided by the clock, not by the status |
| A ca checked in hours after it opened still reads "Đúng giờ"           | Two causes. (1) The ca's template has no hours: `select name, start_time, end_time from public.shifts` — a `null` `start_time` cannot judge punctuality, so the row is `ON_TIME` by construction and `/check-in` prints "Ca chưa khai giờ nên không đối chiếu được đi muộn". (2) The row was stamped by a build before SCRUM-68 derived the status from the evidence (a check-out then replaced `LATE` with `EARLY_LEAVE` and a re-open with `ON_TIME`): the next Ra ca / Vào ca lại recomputes it from the stored giờ vào, and a manager can set it right immediately with "Sửa giờ" (which records who and why) |
| `/schedules` shows "0 ca trong tuần" for the employee who has a ca     | Fixed by SCRUM-68: the tab filtered every row through `manageableIds` (the branches the caller *heads*), which is empty for an employee. It is scoped by branch for a `MANAGER` only; an employee now sees the rows RLS gives them |
| "Bảng công" is missing from an employee's sidebar                      | By design since SCRUM-68: `attendance:view` is a manager capability, and the employee's own timesheet is the "Lịch sử 30 ngày" list on `/check-in`. `GET /api/attendance` still answers them — it is what that list reads, narrowed to their own rows by RLS |
| An employee cannot correct their own check-in time                    | By design: `attendance_guard_self_update` lets them complete the record (giờ ra, ghi chú, khiếu nại) while only an `OWNER`/`MANAGER` (SCRUM-59 `attendance:review`) may change the check-in facts. Have a manager verify the record instead |
| `403` on Xác nhận / khiếu nại                                         | Resolving or verifying needs `attendance:review` (`OWNER`/`MANAGER`); raising one's own khiếu nại does not. Also check for a missing `public.users` row |
| `/employee-status` lists only your own account                        | `get_employee_status` is `security invoker`, so the `users` SELECT policy decides: a policy that only exposes the caller's row shows a one-row roster                  |
| `/notifications`, `/api/requests` show "Unable to retrieve …" (500)   | Those tables were hand-made before SCRUM-41/48, so their `create table if not exists` never added the declared columns and the `requests_user_id_fkey` foreign key — run `supabase/sql/SCRUM-55_schema_gap_fill.sql`, then `SCRUM-56_requests_foreign_key.sql` if `/api/requests` is still 500 (read its Messages output: it reports the reason). The server log names the exact cause too (`column notifications.body does not exist`, `PGRST200 Could not find a relationship`) |
| `/employee-status` lists everyone as "Không có ca hôm nay"            | Nothing is scheduled (run `SCRUM-30_schedule.sql`, then add assignments) and/or nobody has checked in — the roster is derived from those two tables                             |
| "Unable to retrieve attendance." (or requests / schedule / employee status) | That screen's `GET` answered `500`; the banner is deliberately generic, so the real cause is in the server log (`Failed to …`). The usual reasons: the feature's SQL script is not applied yet — `SCRUM-41` for requests, `SCRUM-22` for employee status — or the session has no `public.users` row |
| `PGRST201` "more than one relationship was found for 'attendance' and 'users'" | Two foreign keys point at `users` (`employee_id` + `verified_by`, or `employee_id` + `created_by`), so PostgREST will not guess. The repositories name the foreign key explicitly (`employee:users!attendance_employee_id_fkey`) — keep that hint when editing a select |
| `PGRST202` "Could not find the function public.get_employee_status"   | The RPC is missing: run `supabase/sql/SCRUM-22_employee_status.sql`                                                                                                            |
| Sửa giờ / đổi vai trò answers `400` with "You cannot change your own…" | By design: an `OWNER` cannot demote or deactivate themselves, so the last owner cannot lock everyone out of the admin app                                                       |
| "Unable to retrieve the organization." (or 500 on `/organization`)   | `SCRUM-51_organizations.sql` is not applied — the `organizations` table and the join RPCs are missing                                                                          |
| `Unable to load user: stack depth limit exceeded` (500 on `/organization` and `/api/auth/session`) | The organization helpers still read `public.users` as `security invoker`, so the `users` policy re-enters itself. Run `supabase/sql/SCRUM-54_fix_organization_policy_recursion.sql`. The same error stops the `/onboarding` redirect, which makes the organization feature look missing after login |
| Login drops you on the dashboard although you are in no organization | Either `SCRUM-51` is not applied (the gate cannot read `organization_id` and skips itself rather than looping) or `SCRUM-54` has not fixed the profile read. Open `/onboarding` directly to check — it is reachable at any time |
| Every screen redirects to `/onboarding`                              | Not a bug: the signed-in account belongs to no organization yet. Create one there (you become its `OWNER`) or join with a code. `proxy.ts` owns that redirect              |
| `403` on join although the code is right                             | The account's email is not on that organization's register — this is the anti-outsider rule. The owner adds it on `/organization`; the message says so                      |
| `429` when joining                                                   | Ten failed join attempts by that account in the last hour (`organization_join_attempts` is both the trail and the throttle)                                                   |
| "The staff account service is not available." (`503`)                | The `staff-account` Edge Function is not deployed yet — deploy it (see "The `staff-account` Edge Function") or onboard people with an invite instead                          |
| `POST /api/organizations/accounts` answers `409` although nobody by that name is in `public.users` | The address already has a Supabase Auth account, or its register row is already claimed — the Edge Function returns the same status for both. Read the form's own banner, which repeats the function's answer: "đã là thành viên" means the register row is claimed and nothing is left to create; the other sentence means the address already has a login and is **not** a member, so the person signs in with that login and joins with the code instead of being provisioned again. Only when that login is a leftover from a half-finished create — check **Authentication → Users** in Supabase for the email, because an `on_auth_user_created` gap (SCRUM-50 not applied when it was created) leaves an auth user with **no** `public.users` row, which is what makes the account look like it does not exist — apply `SCRUM-50_user_registration.sql`, delete the leftover auth user, then create it again |
| `/organization` shows the amber "chức năng này chưa được bật" note   | Read the sentence: the probe (`GET /api/organizations/accounts`) says which case it is — `not_deployed` (deploy the function), `not_allowed` (your account needs an organization and `OWNER`), `unauthenticated` (turn "Verify JWT" back on) or `misconfigured` (the function answers 5xx: check its secrets and logs) |
| Attendance / revenue / schedules look empty after `SCRUM-53`         | The rows still have `organization_id = null`: the script's backfill only runs when exactly one organization exists. Assign them with the `update` statements printed at the end of that script, then re-run its second verification query |
| Xoá chi nhánh answers `409`                                          | By design (SCRUM-61): `attendance`, `shift_assignments` and `facilities` cascade on delete and `daily_revenue.branch_id` has no foreign key, so a branch with history cannot go. The sentence names the counts — move or remove them first (or deactivate the branch instead of deleting it) |
| A manager answers `403` on Xác nhận / Xếp ca / mở ca / thiết bị       | They are not the chi nhánh trưởng of that branch: `branches.manager_id` names somebody else or nobody. Assign the branch head on `/branches` (an owner action, `branch:manage`) — a manager who heads no branch can read the organization but write nothing |
| Chỉnh sửa chi nhánh answers `403` although I am a manager              | Only the branch head edits their branch, and only the owner changes `manager_id` (SCRUM-61). The row reads **Chỉ xem** when the branch is not yours, and the Chi nhánh trưởng field is disabled for a manager |
| Every branch picker is grayed out ("— chỉ xem")                       | `SCRUM-61_branch_scope.sql` is applied but `branches.manager_id` is empty for those rows, so `heads_branch()` answers false for all of them. Assign a chi nhánh trưởng, or sign in as the owner |
| `POST /api/requests` answers `500 ... violates check constraint "requests_request_type_check"` | The database's `request_type` CHECK still speaks the vocabulary the hand-made table was created with, while the app sends `REQUEST_TYPES` (`Nghỉ phép`, `Đổi ca`, `Điều chỉnh công`, `Khác`). Run `SCRUM-62_request_type_constraint.sql` and read its Messages tab: it prints the old definition before replacing it. If you would rather keep the old values, extend the `in (...)` list **and** `REQUEST_TYPES` — never one of the two alone |
| Every authenticated screen answers `500` and the log says `column users.branch_id does not exist` | The build selects `users.branch_id` (the session carries it), so `SCRUM-63_employee_branch.sql` has to be applied first — this column is not one the app can skip, unlike `is_active` |
| An employee sees no branch, no ca, no bảng công, and "Tạo đơn" is missing | Intended (SCRUM-63): the account has no `users.branch_id`. Assign the branch on `/staff` (owner only, "Chi nhánh" column); until then the account belongs to no branch and reaches nothing branch-scoped — including the API, which answers `403` to a submission |
| An employee answers `403` when filing for another branch                   | Also intended: `CreateRequestUseCase` and `requests_insert_own` both compare the đơn's branch with `current_branch_id()`. The dialog shows the branch as a statement for an employee, so this is a hand-made request only |
| A manager's `/staff` row shows only "Phụ trách: …" with no branch select | Intended (SCRUM-63): only an `EMPLOYEE` is attached to `users.branch_id`, which is what that select sets. What a manager runs comes from `branches.manager_id`, so the grey line mirrors that instead — a picker and the amber warning would both be misleading for a role that reads the whole organization (SCRUM-60). Assign a head on `/branches` if that line is wrong |
| `/branches` flags a row "Chủ sở hữu không phụ trách chi nhánh — cần gán quản lý chi nhánh" | The owner is no longer offered as a chi nhánh trưởng (SCRUM-63): they stand above every branch. Open the branch, pick a `MANAGER` (or clear the field) and save — the modal explains why the field opens empty and the API answers `400` if an owner is sent |
| A manager's modal on `/branches` shows "— Chưa gán —" for a head I never touched | Only the `OWNER` may change `manager_id`, and the field is disabled for anybody else; a *legacy* head the app no longer accepts (an owner) is cleared on open for the owner, with the amber note above it |
| `GET /api/geo/reverse` answers `503` and the log says "A reverse geocoding provider failed" | Both geocoders are unreachable. Check the machine's DNS first: a resolver (or a hosts-file / ad-blocking rule) that maps `nominatim.openstreetmap.org` to `127.0.0.1` also blanks the branch map tiles, because they come from `tile.openstreetmap.org` of the same project. The second provider (Photon, `photon.komoot.io`, SCRUM-64) answers anyway unless the whole OpenStreetMap project is blocked; the operator can always type the address by hand |
| The "Nhóm thiết bị" picker on `/facilities` shows only the six built-in groups | The catalogue came back empty, so the screen fell back to `FACILITY_CATEGORIES` — usually `SCRUM-65_facility_categories.sql` is not applied yet (the same reason "Thêm nhóm thiết bị" answers `500`). The six stay selectable, so the screen keeps working while the script is missing |
| Saving a facility answers `400` "The selected facility category does not exist" | The `category` sent is not in the organization's catalogue (SCRUM-65) — a stale form (reload it) or a body written by hand. `facilities_category_fkey` is the check; `select code, name from public.facility_categories` lists what is valid |
| Saving a facility answers `400` "code is generated by the server and must not be sent" | The body carried a `code`. Since SCRUM-67 the tag is generated from the branch and the field is read-only in the UI — remove that key from the request |
| A facility answers `409` "Mã tài sản này đã được dùng cho một thiết bị khác trong tổ chức" | The unique index `facilities_organization_code_key` refused the insert/update. With generated codes this needs two saves that picked the same number in the same instant (retry) — or a `code` written straight into the table, since the API accepts none any more |
| Every branch row shows "chưa có số thứ tự" and asset codes look like `HSVH-0001` | `SCRUM-67_branch_asset_prefix.sql` is not applied: `withAssetPrefixColumn()` gets PostgREST's `42703` and reads the branches without `asset_prefix`, so tags fall back to the bare acronym and no branch has a number — the screens stay usable instead of answering `500`. The server log names the script. Run it (step 2 numbers the existing branches in creation order) and the next request picks the column up, no restart needed |
| A manager's `/employee-status` lists every branch | Intended only for the owner (SCRUM-60 lets a manager *read* the organization). A manager's roster is filtered server-side to the branches they head (SCRUM-63); if the list is still organization-wide, `branches.manager_id` is empty for those rows — assign a chi nhánh trưởng on `/branches` |
| The "Chi nhánh" field of the ca modal is grey and cannot be edited | By design (SCRUM-63): a branch is where the chosen employee works (`users.branch_id`), so it is filled from the person instead of chosen. An employee without one shows the amber "Nhân viên này chưa được gán chi nhánh" — assign a branch on `/staff` (owner only) |
| A manager picks any branch in "Tạo đơn" | They cannot any more (SCRUM-63): the dialog lists only the branches they head and the API answers `403` for any other. A manager who heads none gets no "Tạo đơn" at all — assign them a branch on `/branches` |

| The bell always reads `0` although the team is busy working | Nothing in the app writes `notifications` — the producers are database triggers (SCRUM-70/71/72). Apply those three scripts in order; the inbox stays empty until then, which is exactly the state SCRUM-48 shipped |
| A notification never arrives for the person who should get it | Four designed reasons, in order of likelihood: the actor is never told about their own click; a recipient with `users.is_active = false` is left out of a fan-out set; the recipient turned the `in_app` channel off on `/notifications`; or the same `user + type + entity` was already written within the 5-minute dedupe window. `select type, user_id, title, created_at from public.notifications order by created_at desc limit 20;` shows what the triggers did write |
| `GET /api/notifications` answers `400 Unknown notification type(s)` | The `type` parameter names a code `lib/domain/notificationCatalog.ts` does not know. The group chips send the catalog's own codes, so this only happens on a hand-written URL — pass one of the codes listed in `/api-docs` |
| A member receives a notification that is not theirs | Check the recipient resolution, not RLS: `organization_owner_ids` / `branch_manager_ids` read the row's own `organization_id` and `branches.manager_id` through a `security definer` helper, while `notifications_select_own` still limits every session to `user_id = auth.uid()`. Two organizations can never see each other's rows |
| A trigger answers `must be owner of function …` when applying SCRUM-70/71/72 | The `revoke` block needs the role that owns the functions — run the script in the Supabase SQL Editor (as the project owner), not as a different role |

| Every Sửa / Xoá button disappears from `/schedules` and "Xếp ca" refuses | `manageableIds` is built from `GET /api/branches`, and it also decides whether a ca may be written (SCRUM-61): a failed branch request used to be swallowed silently, which made a permission problem out of a network one. The screen now says so in its banner. If the list loaded, the caller is neither the organization's `OWNER` nor the chi nhánh trưởng of those branches — check `select role, organization_id, branch_id from public.users where id = auth.uid();` (SCRUM-59 turned a legacy `CHU` into `MANAGER`, so an account that used to run the organization now heads no branch until a real `OWNER` assigns one or promotes it) |
| "Xếp ca" refuses with "Nhân viên này chưa được gán chi nhánh" | By design (SCRUM-63): a ca belongs to the branch the employee works at, and a ca in a branch they do not belong to would be invisible to them. Only the owner may set `users.branch_id`, so the modal offers the owner an inline "Gán chi nhánh" next to the message (a manager has to ask the owner, or use `/staff`) |
| Creating (`Xếp ca`) or deleting a ca answers `500 Unable to create/delete the shift assignment.` while editing one works | A notification trigger on `shift_assignments` (SCRUM-71) could not store its row and rolled the write back with it. On this project's legacy `notifications` table that is the hand-made `content` column still being `NOT NULL` while the writer fills `body` → run `SCRUM-74_notifications_legacy_columns.sql` (its step 3 prints `OK`/`FAILED` with the database's own reason), then `SCRUM-73` so a future failure of this kind can never roll back a ca again. An edit that only changes a note still worked because that path returns before it notifies |
| Operations succeed but the bell stays empty, and the log shows `notify_user: could not store` | The notification triggers cannot reach `public.notifications` (SCRUM-73 reports the loss instead of failing the write). Step 4 of `SCRUM-74` prints which role owns the table and which owns `notify_user` — when they differ, the definer is subject to RLS: re-run `SCRUM-70` in the SQL Editor as the role that owns the table, and check the table has no `FORCE ROW LEVEL SECURITY` |
| A chi nhánh trưởng cannot `Khai báo mở ca` / `Chốt ca` (rose banner `Unable to declare opening revenue.`) while the owner can do the same thing | The request is not what is wrong — the **write is rolled back by its own notification**: `daily_revenue`'s AFTER trigger (SCRUM-71) calls `notify_users`, which INSERTs into the hand-made `notifications` table, and that INSERT fails with `23502` on a legacy mandatory column (`content`). Read the dev terminal for `Failed to declare opening revenue` (the PostgrestError names the column) and run `supabase/sql/SCRUM-76_notifications_never_break_business_writes.sql` — one paste: it relaxes every mandatory-without-default column, installs the guarded `notify_user`, and prints `OK`/`FAILED` from a real insert. `SCRUM-74` then `SCRUM-73` is the same fix in two steps. Nothing here is a branch-scope (`403`) or RLS problem: `assertBranchManagedBy` already passed, otherwise the answer would name the rule |
| `Cài đặt kênh nhận` (the drawer on `/notifications`) answers `500 Unable to update notification settings.` for **every** account, owner and employee alike | Not a permission problem: the write is the caller's own row (`auth.uid() = user_id`), so RLS is satisfied for every role and what refuses the row is the table. `PUT /api/notifications/settings` upserts only `{ user_id, channel, enabled }`, while `public.notification_settings` is hand-made (SCRUM-48's `create table if not exists` was a no-op) and its declared `updated_at … default now()` never landed — the `before update` trigger does not run on INSERT, so the INSERT dies with `23502 null value in column "updated_at"`. Run `supabase/sql/SCRUM-77_notification_tables_write_path.sql`: it restores the declared defaults, prints the column list before/after, and proves the drawer's own upsert with a self-deleting probe (`OK`/`FAILED` + SQLSTATE). The dev terminal shows `Failed to update notification settings` with the database's reason |
| Turning off "Trong ứng dụng" for an account does not stop that account's notifications | The switch is stored, so the gate is the suspect: `public.notification_in_app_enabled()` (SCRUM-70) is a `security definer`, and if its owner does not own `notification_settings` its read is filtered by `notification_settings_select_own` — which inside a trigger runs with the *actor's* `auth.uid()` and can never match the *recipient* — so it answers `true` for everybody. §5 of `SCRUM-77_notification_tables_write_path.sql` prints `stored` next to `gate` per account; `stored = false, gate = true` is that bug, and the fix is to run SCRUM-70 (or SCRUM-76 §3) in the SQL Editor as the role that owns the table. Remember `email`/`push` are switches without a delivery service behind them |

| Filing a đơn notifies nobody (neither the owner nor the employee) | Two independent reasons, read them in order. **(a) The employee**: the actor is deliberately excluded from every fan-out (`without_user`), because nobody is told about their own click — an employee hears about the đơn when it is duyệt/từ chối, not when they file it. **(b) The owner received nothing**: either the row was never stored or that account is muted. Check `select type, user_id, created_at from public.notifications order by created_at desc limit 10;` — empty means the fan-out could not write (run `SCRUM-74` and read its step-3 `OK`/`FAILED` line, which names the database's reason) — and `select user_id, channel, enabled from public.notification_settings;`, where `in_app = false` silences that account (the settings drawer now warns about it in amber) |

## Related documents

| File / URL                            | Content                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `AGENTS.md` (imported by `CLAUDE.md`) | Rules for AI agents and contributors: architecture, conventions, boundaries, gotchas |
| `design.md`                           | Design system reference measured from the shipped screens: colour/type tokens, component recipes, screen conventions |
| `/api-docs`, `GET /api/swagger`       | Always-current API reference generated from the route JSDoc                          |
| `supabase/sql/SCRUM-*.sql`            | The authoritative schema: tables, indexes, RLS policies and RPC functions            |

This README documents the `hr_website` app only. The repository root (one level up) also contains
`hr_mobile_app` (Flutter) and `landing_website` (Next.js), each with its own documentation.

## Tổng quan nhanh (Tiếng Việt)

- **Đây là gì:** web admin quản lý nhân sự và vận hành ca cho Humora — khai báo doanh thu
  đầu/cuối ca, duyệt đơn từ, xếp ca, bảng công, trạng thái nhân viên, thông báo, tìm kiếm nhanh và trợ lý
  AI hỏi đáp chính sách/hợp đồng.
- **Công nghệ:** Next.js 16 (App Router) + TypeScript + Tailwind v4; Supabase (PostgreSQL, Auth, RLS, RPC)
  là toàn bộ backend; Gemini `gemini-embedding-001` (768 chiều) + `gemini-3.5-flash` cho trợ lý AI. Không có server API
  riêng và không dùng ORM.
- **Kiến trúc:** Clean Architecture — `app/api/**/route.ts` chỉ nhận request, xác thực rồi gọi đúng một use
  case; nghiệp vụ nằm trong `lib/usecases`; `lib/infrastructure` (Supabase, Gemini) triển khai các interface
  khai báo trong `lib/domain`.
- **Chạy dự án:** tạo `.env.local` gồm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `GEMINI_API_KEY`; chạy các script trong `supabase/sql/` bằng Supabase SQL Editor; sau đó `npm install` và
  `npm run dev`.
- **Tài liệu API:** mọi route phải có khối JSDoc `@swagger`; xem `/api-docs` hoặc `GET /api/swagger`.
  `public/swagger.json` là file sinh tự động, không sửa tay.
- **Trạng thái:** toàn bộ màn hình đã dùng Supabase thật — doanh thu, chi nhánh, cơ sở vật chất, lịch làm
  việc, đơn từ, bảng công (chấm công + vị trí theo bán kính chi nhánh + khiếu nại + xác minh và sửa giờ của
  quản lý), trạng thái nhân viên (RPC `get_employee_status`), quản lý nhân sự (vai trò, cho nghỉ việc),
  thông báo, tìm kiếm và chat AI; không còn dữ liệu mẫu
  (`lib/mock/adminStore.ts` đã bị xoá): từ SCRUM-68 web tự chấm công vào ca / ra ca ở màn hình `/check-in`
  (chủ sở hữu không chấm công), còn app mobile là client ghi thêm ảnh xác minh; web chỉ duyệt và sửa giờ.
  Đã có màn hình đăng
  nhập `/login` và đăng ký `/register` (route `/api/auth/*` → use case → `SupabaseAuthService`) với
  `proxy.ts` chuyển hướng khi chưa có phiên; cần chạy `SCRUM-50_user_registration.sql` để tài khoản đăng ký
  có hồ sơ trong `public.users` (vai trò mặc định `EMPLOYEE`, quyền quản lý do chủ sở hữu cấp); chưa có test
  hay CI.
- **Múi giờ:** dữ liệu lưu ở UTC, ngày nghiệp vụ tính theo `Asia/Bangkok` (UTC+7).
