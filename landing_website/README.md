# HR & Chấm công — Landing website

Marketing and introduction site for the **HR & Attendance Management System** (Vietnamese:
"Hệ thống Quản lý Nhân sự và Chấm công"), a HUFLIT software-engineering coursework project. It
presents the product — an attendance and HR app for a multi-branch business — together with the team
behind it and a contact form.

It is a **static Next.js 16 (App Router) + TypeScript** site: no database, no API routes, no
environment variables and no runtime dependencies beyond `next`, `react` and `react-dom`. Nothing here
talks to Supabase — the actual applications live in the sibling folders `../hr_website` (admin web app)
and `../hr_mobile_app` (Flutter employee app).

## Pages

| Route       | File                    | Content                                                                                                                                                                                    |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`         | `app/page.tsx`          | Interactive feature deck: six 9:16 cards you can swipe, drag or step through with `←` / `→`; clicking the middle card slides open a full-screen detail panel (`Enter` opens, `Esc` closes) |
| `/features` | `app/features/page.tsx` | The six features as a static card grid — Chấm công (face check-in), GPS & WiFi validation, work efficiency, automatic payroll, shift management, tasks & messages                        |
| `/team`     | `app/team/page.tsx`     | The five team members with their roles (frontend/backend web, backend/frontend app, tester)                                                                                                |
| `/contact`  | `app/contact/page.tsx`  | Client-side contact form that swaps to a thank-you panel after submitting (see "Known notes")                                                                                              |

All copy is Vietnamese. `app/layout.tsx` wraps every page with `Navbar` (fixed, `mix-blend-difference`)
and `Footer`, and sets the metadata title *"Hệ thống Quản lý Nhân sự và Chấm công"*.

## Tech stack

| Concern   | Choice                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| Framework | Next.js 16.3.6 (App Router) + React 19.2.8                                     |
| Language  | TypeScript 5 with `strict: true`                                               |
| Styling   | Tailwind CSS v4 via `@tailwindcss/postcss` (there is no `tailwind.config.*`)   |
| Fonts     | Playfair Display (`next/font/google`, latin + vietnamese subsets)              |
| Lint      | ESLint 9 with `eslint-config-next` (`core-web-vitals` + `typescript`)          |
| Backend   | None — the site is static and self-contained                                   |

## Design language

The site deliberately uses a loud "neo-brutalist" look; match it when adding sections:

- Ink/red `#e8381c` as the main colour, accents `#ff5a1f`, `#2f8f5b`, `#e8456b`, `#7a4cff`, `#0f6fb3`,
  pastel backgrounds `#cfe3ff`, `#ffe3c9`, `#fff1e3`, `#d9f2e3`, `#ffd9e2`, `#e6dcff`, `#d4eaf9`.
- Thick black outlines (`border-[6px] border-black`), `rounded-[2rem]` cards, `shadow-xl`/`shadow-2xl`,
  hover rotation plus slight scale, and oversized black-weight Playfair headlines (`text-[14vw] font-black`).
- Inner pages use full-screen sections with a `mx-auto max-w-6xl px-6 pt-32` content block.

## Project structure

```text
landing_website/
├── app/
│   ├── layout.tsx          Metadata + Navbar/Footer shell
│   ├── page.tsx            "/" — renders FeatureShowcase
│   ├── features/page.tsx   "/features"
│   ├── team/page.tsx       "/team"
│   ├── contact/page.tsx    "/contact" (client component)
│   ├── globals.css         Tailwind entry + theme tokens
│   └── favicon.ico
├── components/
│   ├── Navbar.tsx          Fixed top navigation (Trang chủ / Tính năng / Nhóm / Liên hệ)
│   ├── Footer.tsx          Copyright line
│   ├── FeatureShowcase.tsx Home card deck + slide-up detail panel (client component)
│   └── ScrollStory.tsx     Scroll-driven story variant — currently unused
├── lib/fonts.ts            Shared Playfair Display instance
├── public/                 Default create-next-app SVGs (referenced by no page)
├── AGENTS.md / CLAUDE.md   Agent rules (managed Next.js block; CLAUDE.md imports @AGENTS.md)
└── next.config.ts          Empty — no custom configuration
```

## Getting started

Node.js 20+ and npm are all you need. This folder is **not installed yet** in the checkout
(`node_modules/` and `.next/` are absent and git-ignored), so start with an install:

```bash
cd landing_website
npm install
npm run dev            # http://localhost:3000
```

| Command            | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `npm run dev`      | Dev server with hot reload on port 3000                       |
| `npm run build`    | Production build (needs outbound access for the Google font)   |
| `npm start`        | Serve the production build                                    |
| `npm run lint`     | ESLint                                                        |
| `npx tsc --noEmit` | Typecheck — there is no `typecheck` script                    |

> `../hr_website` also defaults to port 3000 — run one at a time, or start this one with
> `npm run dev -- -p 3001`.

## Working on this site

- Pages are App Router files: add a folder under `app/` with a `page.tsx` (default export) and link it
  from `components/Navbar.tsx` so navigation stays complete.
- Add `"use client"` only when a page truly needs state, effects or browser APIs — `contact` and the two
  showcase components do; `features`, `team` and `layout.tsx` stay server components.
- Import through the `@/*` alias (`@/components/Navbar`, `@/lib/fonts`), keep copy in Vietnamese, and
  reuse the palette and outline style above instead of introducing a second visual language.
- Tailwind v4 has no config file: styling is plain utility classes plus the `@theme` tokens in
  `app/globals.css` — add tokens there if you need new named colours.
- Fonts come from `next/font/google`, so `npm run build` needs outbound network access.
- `AGENTS.md` (imported by `CLAUDE.md`) carries the Next.js agent rules; this README is the human guide.

## Known notes

- `components/ScrollStory.tsx` is rendered nowhere — it is an alternative homepage kept for later. Either
  wire it up or delete it deliberately.
- The Playfair Display font is declared twice: in `lib/fonts.ts` (used by the inner pages) and inline
  inside `FeatureShowcase.tsx` / `ScrollStory.tsx`. Prefer the shared instance when touching them.
- `app/globals.css` still carries the create-next-app theme tokens (`--font-geist-sans`,
  `--font-geist-mono`) and sets the body font to Arial, although no Geist font is loaded and the pages
  render Playfair Display.
- The contact form only flips local state on submit — nothing is sent or stored, so it needs a real
  endpoint before it can be called functional.
- The team page mentions Firebase / Cloud Functions for the payroll work, while the applications in this
  repository use Supabase; keep that copy in sync if the stack changes.
- `public/*.svg` are unused create-next-app placeholders, and there is no CI, no Docker and no tests for
  this folder.
- `next.config.ts` is empty. If `next dev` ever complains about the workspace root (the parent folder has
  its own `package.json` and `node_modules`), add the same `turbopack: { root: process.cwd() }` setting
  that `../hr_website/next.config.ts` uses.

## Related documentation

| Where                                   | Content                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `../README.md`                          | Repository overview: all three apps and how to run each one              |
| `../hr_website/README.md`               | The admin web app: API endpoints, Supabase schema, environment variables |
| `../hr_website/supabase/sql/*.sql`      | The authoritative database schema of the system                          |
| `AGENTS.md` / `CLAUDE.md` (this folder) | Next.js agent rules; `CLAUDE.md` simply imports `@AGENTS.md`             |

## Tổng quan nhanh (Tiếng Việt)

- **Đây là gì:** website giới thiệu "Hệ thống Quản lý Nhân sự và Chấm công" (đồ án môn học HUFLIT) — trang
  chủ dạng thẻ tính năng tương tác, cùng các trang Tính năng, Nhóm và Liên hệ.
- **Công nghệ:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4, font Playfair Display.
  Không có backend, không API, không biến môi trường — web tĩnh, tách biệt với Supabase.
- **Chạy dự án:** `cd landing_website`, `npm install`, `npm run dev` (mặc định cổng 3000; nếu chạy cùng
  `hr_website` thì thêm `-p 3001`).
- **Phong cách:** nền pastel, viền đen dày, chữ Playfair đậm cỡ lớn — giữ đúng bảng màu sẵn có khi thêm mục mới.
- **Lưu ý:** `components/ScrollStory.tsx` hiện chưa được dùng; form Liên hệ mới chỉ đổi trạng thái phía
  client, chưa gửi đi đâu; `next.config.ts` vẫn còn trống.
