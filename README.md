# HR — Human Resource & Shift Management

Repository for the **Humora** HR & shift-management project (HUFLIT coursework). It contains **three
separate applications** that share **one Supabase backend** (PostgreSQL + Auth + Row Level Security):
an admin web app, an employee mobile app, and a marketing landing site.

```text
employees ──► hr_mobile_app (Flutter)  ─┐
                                        ├──► Supabase (Postgres + Auth + RLS)
managers  ──► hr_website (Next.js)     ─┘
visitors  ──► landing_website (Next.js, static)
```

## Applications at a glance

| Folder             | What it is                                                                                                                                    | Stack                                                                                        | Run it                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `hr_website/`      | **HR admin web app** — per-shift revenue declaration, request approval, shift scheduling, attendance, employee status, notifications, quick search, AI policy assistant | Next.js 16 (App Router), TypeScript, Tailwind v4, Supabase (`@supabase/ssr`), Google Gemini | `npm run dev` → <http://localhost:3000>, API docs `/api-docs` |
| `hr_mobile_app/`   | **Employee mobile app** — login, employee home, work schedule                                                                                   | Flutter / Dart (`sdk ^3.12.2`), `supabase_flutter`                                            | `flutter run` (web build uses path URLs)                 |
| `landing_website/` | **Marketing landing site** — home, features, team, contact                                                                                      | Next.js 16 (App Router), TypeScript, Tailwind v4, Playfair Display font                       | `npm run dev` → <http://localhost:3000>                  |

Each app is independent: its own manifest (`package.json` / `pubspec.yaml`), its own dependencies and its
own tooling. There is no shared workspace, no root build, and nothing to run from this folder itself.

## Shared backend (Supabase)

- One Supabase project serves the web admin and the mobile app; the landing site is static and needs no
  backend.
- **RLS is the security boundary**: both clients use the public anon / publishable key and the database
  policies decide what a session may read or write. Never add a service-role key to a client.
- The schema, indexes, RLS policies and RPC functions for the web admin live in
  `hr_website/supabase/sql/SCRUM-*.sql` and are applied **by hand** in the Supabase Dashboard → SQL
  Editor (there is no migration runner and no Supabase CLI here).
- Business dates are computed in **Asia/Bangkok (UTC+7, no DST)**, while timestamps are stored in UTC.

## Getting started

### Prerequisites

| App               | You need                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `hr_website`      | Node.js 20+ and npm, a Supabase project (URL + anon key) and a Google Gemini API key          |
| `hr_mobile_app`   | The Flutter SDK (Dart `^3.12.2`); the Supabase project credentials come from `lib/main.dart`  |
| `landing_website` | Node.js 20+ and npm — no backend required                                                     |

### 1. HR admin web app — `hr_website/`

```bash
cd hr_website
npm install
# create .env.local with:
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#   GEMINI_API_KEY=...
# then run supabase/sql/SCRUM-*.sql in the Supabase SQL Editor (order is documented in hr_website/README.md)
npm run dev        # admin app on port 3000; Swagger UI lives at the /api-docs route
```

Architecture, the full endpoint list, database scripts and current limitations are documented in
[`hr_website/README.md`](hr_website/README.md).

### 2. Employee mobile app — `hr_mobile_app/`

```bash
cd hr_mobile_app
flutter pub get
flutter run                  # pick a device/emulator, or: flutter run -d chrome
```

Supabase is initialized in `lib/main.dart` with the project URL and publishable key. Routes live in
`lib/routes/app_routers.dart` — `/login` (initial route), `/employee/home` and
`/employee/workschedule` — and the screens for them currently sit in `lib/models/`.

### 3. Landing site — `landing_website/`

```bash
cd landing_website
npm install
npm run dev                  # http://localhost:3000, or: npm run dev -- -p 3001
```

Pages: `/` (feature showcase), `/features`, `/team`, `/contact`, wrapped by `Navbar` + `Footer`.

> Both Next.js apps default to port 3000 — change one with `-p`, or stop it before starting the other.

## Repository layout

```text
D:\HR\
├── README.md              ← this file: what each app is and how to run it
├── hr_website\            Next.js HR admin app (see hr_website/README.md and hr_website/AGENTS.md)
│   ├── app\               App Router screens + app/api/**/route.ts endpoints
│   ├── lib\               domain / usecases / infrastructure (Clean Architecture)
│   ├── supabase\sql\      Schema, RLS policies and RPCs, applied by hand in Supabase
│   └── public\swagger.json Generated OpenAPI spec — never edited by hand
├── hr_mobile_app\         Flutter employee app (lib\main.dart, lib\routes, lib\models, lib\widgets)
└── landing_website\       Next.js landing site (app\, components\, lib\fonts.ts)
```

Repository notes:

- The git repository root **is** this folder, so paths in `git status` / `git diff` start with an app
  folder (`hr_website/lib/...`, `hr_mobile_app/lib/...`).
- `package.json`, `package-lock.json` and `node_modules/` also exist here, left over from an install run at
  the wrong level: the only dependency is `@google/generative-ai`, there are no scripts, and they are
  committed. Nothing in this repository should be installed or run from the root.
- Each web app carries its own `AGENTS.md`, and `CLAUDE.md` imports it (`@AGENTS.md`). The rules in
  `hr_website/AGENTS.md` are the detailed ones; `landing_website/AGENTS.md` currently holds only the
  managed Next.js block.
- `hr_website` has no test runner (`npx tsc --noEmit` is the gate, and `npm run lint` is currently red),
  and `hr_mobile_app/test/widget_test.dart` is still the default Flutter counter smoke test, which no
  longer matches the app and therefore fails.

## Working in this repository

- **One app per change.** Work inside the folder of the app you are touching and keep unrelated churn out
  of the commit; the three apps share a repository but not their code.
- Branches `feat/…`, `fix/…`, `chore/…`; conventional commits scoped by app
  (`feat(website): …`, `fix(mobile): …`, `feat(api): …`); one logical change per commit; quote the SCRUM
  ticket (`SCRUM-44`) when the work maps to one.
- Read that app's README and `AGENTS.md` first. The admin web app in particular enforces a strict
  layering (route handler → use case → repository) and a mandatory `@swagger` JSDoc block on every route.
- Never commit `.env.local`, API keys or real employee data. Supabase credentials stay in the dashboard,
  and RLS — not the key — is what protects the data.

## Documentation map

| Where                                        | Content                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `hr_website/README.md`                       | The detailed guide: architecture, every API endpoint, SQL scripts, environment variables, troubleshooting, status |
| `hr_website/AGENTS.md` + `CLAUDE.md`         | Web-app rules for contributors and AI agents (layering, conventions, boundaries, gotchas); `CLAUDE.md` imports `@AGENTS.md` |
| `landing_website/AGENTS.md` + `CLAUDE.md`    | The same mechanism for the landing site; today it holds only the managed Next.js agent block                     |
| `hr_website/supabase/sql/*.sql`              | The authoritative database schema: tables, indexes, RLS policies and RPC functions                              |
| `/api-docs` on the running admin app          | Swagger UI built from each route's `@swagger` block                                                             |
| `hr_mobile_app/README.md`, `landing_website/README.md` | Still the default Flutter / create-next-app boilerplate — worth writing                                           |

## Tổng quan nhanh (Tiếng Việt)

- **Kho này gồm 3 ứng dụng** dùng chung một backend Supabase: `hr_website` (web admin cho quản lý),
  `hr_mobile_app` (app Flutter cho nhân viên) và `landing_website` (web giới thiệu sản phẩm). Đây là đồ án
  môn học (HUFLIT).
- **Mỗi thư mục là một dự án riêng:** hãy `cd` vào thư mục đó để cài đặt và chạy lệnh, không chạy gì ở thư
  mục gốc. `package.json` và `node_modules` ở gốc là phần còn lại của một lần cài nhầm, không dùng đến.
- **Web admin (`hr_website`):** `npm install`, tạo `.env.local` gồm `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`; chạy các script trong `supabase/sql/` bằng Supabase SQL
  Editor; sau đó `npm run dev` — tài liệu API ở route `/api-docs`.
- **App nhân viên (`hr_mobile_app`):** `flutter pub get` rồi `flutter run`. Cấu hình Supabase nằm trong
  `lib/main.dart`, danh sách route trong `lib/routes/app_routers.dart` (`/login`, `/employee/home`,
  `/employee/workschedule`).
- **Web giới thiệu (`landing_website`):** `npm install` và `npm run dev`, không cần backend. Cả hai web đều
  mặc định cổng 3000 nên chạy lần lượt hoặc đổi cổng bằng `-p`.
- **Nguyên tắc chung:** RLS là ranh giới bảo mật (không đưa service-role key vào client); dữ liệu thời gian
  lưu ở UTC nhưng ngày nghiệp vụ tính theo `Asia/Bangkok` (UTC+7); không commit khóa bí mật hay dữ liệu
  nhân viên thật.
