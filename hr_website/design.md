# Humora HR — Design System & UI Guidelines

Reference for the visual language of the admin web app (`hr_website/`). Everything below was measured
from the shipped screens — `app/layout.tsx`, `components/Sidebar.tsx`, `components/Header.tsx`,
`app/globals.css` and the nine screens under `app/*/page.tsx` — so new work stays visually consistent
with what already exists.

Scope: presentation only. For architecture, layering and API rules see `AGENTS.md`.

---

## 1. Design principles

| Principle | How it shows up in the code |
| --- | --- |
| **Calm, data-dense admin** | Thin `border-slate-200` hairlines, `shadow-sm` only, no gradients, no heavy shadows. Colour is reserved for state, never decoration. |
| **One accent, many tints** | A single brand blue `#0C66E4`, used with `blue-50`/`blue-100` tints for emphasis and active states. |
| **Micro-labels over big type** | Metadata is `text-[10px]` / `text-[9px]` uppercase `tracking-wide text-slate-400`; the biggest text on a page is the `text-2xl` H1. |
| **State must be unmissable** | Every status is a coloured pill (emerald / amber / rose / blue / slate). Meaning is never carried by text alone. |
| **Numbers are scannable** | Currency via `new Intl.NumberFormat("vi-VN")`, amounts in `tabular-nums`, right-aligned in tables. |
| **Vietnamese-first copy** | All user-facing strings are Vietnamese; code, identifiers and comments stay English. |

---

## 2. Colour tokens

Defined in `app/globals.css`, in two layers:

1. **Semantic tokens** for the app's own colours. Components use these, never a literal hex:
   `bg-surface` (panels), `bg-app` (page canvas), `bg-surface-muted` (table head, segmented tracks),
   `bg-canvas` (chat transcript), `bg-primary` / `text-primary` / `border-primary` /
   `hover:bg-primary-strong` (brand).
2. **Tailwind's palette**, re-pointed inside the `.dark` block. Every palette utility compiles to a
   `var(--color-…)` reference, so dark mode re-themes every screen without editing it; only the shades
   actually in use are overridden (list them with `node .palette-probe.cjs`).

```css
:root {
  --surface: #ffffff;        /* panels */
  --app-background: #f8f9ff; /* page canvas */
  --surface-muted: #f3f6fc;
  --canvas: #fbfcff;         /* chat transcript */
  --primary: #0c66e4;
  --primary-strong: #1d4ed8; /* hover of a brand action */
  --foreground: #172033;
}

@theme inline {
  --color-surface: var(--surface);
  --color-app: var(--app-background);
  --color-surface-muted: var(--surface-muted);
  --color-primary: var(--primary);
  --color-primary-strong: var(--primary-strong);
}

.dark {
  --surface: #131c2e;
  --app-background: #0b1120;
  --primary: #3b82f6;
  --color-slate-900: #f0f4fa; /* the palette is re-pointed, not rewritten */
  /* …slate/blue/emerald/amber/rose shades in use… */
}
```

> `--color-white` is deliberately **not** re-pointed: `bg-white` (panels) and `text-white` (text on
> brand buttons) share it, so panels use `bg-surface` instead and `text-white` stays white. Adding a new
> surface means adding a token — do not reintroduce a literal hex in a component.

### 2.1 Brand & surfaces (measured usage)

| Token | Value | Utility as written | Uses |
| --- | --- | --- | --- |
| Primary | `#0C66E4` | `bg-primary`, `text-primary`, `border-primary`, `hover:bg-primary-strong` | ~130 |
| Canvas | `#F8F9FF` | `bg-app` (body, main, input wells) | 11 |
| Inset / muted panel | `#F3F6FC` | `bg-surface-muted` (table head, segmented control, totals rows) | 8 |
| Chat canvas | `#FBFCFF` | `bg-canvas` (AI transcript) | 1 |
| Promo / info panel | `#F1F5FF` | `bg-surface-accent`, `hover:bg-surface-accent-strong` (sidebar promo + 4 info cards) | 6 |
| Surface | white | `bg-surface` (cards, panels, header) | 123 |
| Hairline (strong) | — | `border-slate-200/80` | 15 |
| Hairline (default) | — | `border-slate-200` | 64 |
| Hairline (inside cards) | — | `border-slate-100` | 27 |
| Accent hairline | — | `border-blue-100` | 5 |

### 2.2 Theme (Sáng / Tối / Theo hệ thống)

`components/ThemeToggle.tsx` stores the choice in `localStorage["humora-theme"]`
(`light` | `dark` | `system`) and toggles `.dark` on `<html>`. An inline script in `app/layout.tsx`
applies it before first paint, so reloading in dark mode does not flash light. "Theo hệ thống" follows
`prefers-color-scheme` live (`useSyncExternalStore` on the media query). The control is the compact
segmented control from §6 — Sun / Moon / Monitor, `aria-pressed` on the active option, visible at every
breakpoint in the header.

### 2.3 Semantic tones


Only these pairings are used. Reuse them rather than inventing new ones.

| Meaning | Background | Text | Border | Seen in |
| --- | --- | --- | --- | --- |
| Active / info / brand | `bg-blue-50` (34 uses), `bg-blue-100` | `text-[#0C66E4]`, `text-blue-700`, `text-blue-800` | `border-blue-100/200` | nav active, chips, KPI icon chips |
| Success / valid / on-time | `bg-emerald-50` | `text-emerald-600/700` | `border-emerald-200` | approved, working, khớp |
| Warning / pending / late | `bg-amber-50` (`amber-50/50`, `/60`, `/70`) | `text-amber-600/700/800` | `border-amber-200` | pending, late, lệch nhẹ |
| Danger / rejected / mismatch | `bg-rose-50` | `text-rose-600/700` | `border-rose-200` | rejected, early leave, error banner |
| Neutral / inactive / resigned | `bg-slate-50`, `bg-slate-100` | `text-slate-500`, `text-slate-400` | `border-slate-200` | disabled states, "Nghỉ việc" |
| Extra KPIs | `bg-teal-50/teal-600` | — | — | 4th metric card tone ("mint") |

Accent hexes that appear once or twice (`#F4B740`, `#11A879`, `#E6ECF5`, `#e8edf5`) are one-off
artwork colours — do not promote them into the palette.

---

## 3. Typography

Family: **Be Vietnam Pro**, loaded once in `app/layout.tsx` via `next/font/google`
(`variable: "--font-be-vietnam-pro"`, `subsets: ["latin"]`, `weight: ["400","500","600","700"]`) and
wired to Tailwind through `--font-sans` in `@theme inline`. Body also sets
`font-family: var(--font-be-vietnam-pro), sans-serif`. **Never add a second font.**

| Role | Classes | Notes |
| --- | --- | --- |
| Page title (H1) | `text-2xl font-bold tracking-tight text-slate-900` | 10 uses of `text-2xl` |
| Card title | `text-lg font-semibold text-slate-800` | |
| Body / table cell | `text-xs` (80 uses) | The default size for almost all UI text |
| Comfortable body | `text-sm` (27 uses) | Dialogs, chat, prose |
| Metadata eyebrow | `text-[10px] font-semibold uppercase tracking-wide text-slate-400` | 14 uses of `tracking-wide`; always above the H1 |
| Micro label | `text-[11px]`, `text-[10px]`, `text-[9px]` | Chips, timestamps, table heads |
| Money / metrics | `text-2xl font-bold tabular-nums tracking-tight text-slate-900` | `tabular-nums` is required for aligned figures |

Weights actually used: `font-semibold` (107) > `font-bold` (42) > `font-medium` (28). `font-semibold`
is the workhorse for labels and buttons.

---

## 4. Layout, spacing & rhythm

### 4.1 App shell (`app/layout.tsx`)

```tsx
<body className="... flex min-h-dvh overflow-x-hidden bg-app font-sans text-slate-900 antialiased
                 selection:bg-blue-100 selection:text-blue-900 md:h-dvh md:overflow-hidden">
  <Sidebar />
  <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
    <Header />
    <main className="min-h-0 flex-1 bg-app p-4 md:overflow-y-auto md:p-6">
      <div className="mx-auto w-full max-w-[1440px]">{children}</div>
    </main>
  </div>
</body>
```

- Fixed-height shell from `md` up: `h-dvh` + `overflow-hidden`; only `<main>` scrolls (`md:overflow-y-auto`).
- Below `md` the page scrolls as a normal document (`min-h-dvh`, no inner scroller) — iOS Safari overlays
  the keyboard without resizing the layout viewport, so a field at the bottom of a modal would otherwise
  stay hidden behind it. See §4.4.
- Content is capped at `max-w-[1440px]` and centred; gutters `p-4` → `md:p-6`.
- Sidebar `w-56`, hidden below `md` (the phone gets the drawer of §4.4 instead). It collapses to an
  icon-only rail (`w-16`) from a toggle at its foot; the choice is the `humora-sidebar` cookie, read by
  `app/layout.tsx` so the first paint already has the right width, and written by `Sidebar` itself. Header
  `h-16`, `sticky top-0 z-10`, `border-b border-slate-200/80`.
- The header row shrinks on a phone: hamburger + `min-w-0 flex-1` search + one theme button + bell +
  sign-out. The three-way theme group and the `⌘K` hint are `md`-and-up only.

### 4.2 Page rhythm

- Page root is always `<div className="space-y-5">` (9 uses) — sections stack with 20px gaps.
- Section header block: eyebrow (`text-[10px] uppercase text-slate-400`) → H1 (`text-2xl font-bold
  tracking-tight`) → `mt-1 text-xs text-slate-500` description, with the action buttons in a
  `flex flex-col ... lg:flex-row lg:items-end` sibling.
- Card interiors: `p-4` (compact) or `p-5`/`p-6` (comfortable); table heads `px-4 py-3` / `px-5 py-4`.
- Field groups inside dialogs: `grid gap-4 sm:grid-cols-2`.

### 4.3 Grid recipes

| Purpose | Classes |
| --- | --- |
| Filter / stat row | `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4` |
| Two-up panels | `grid grid-cols-1 gap-6 lg:grid-cols-2` |
| Content + rail | `grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_290px]` |
| Dashboard tiles | `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6` |

Tables always live inside a horizontally scrolling wrapper on the section, with the table itself
carrying `w-full min-w-[540px]` (compact) or `min-w-[920px]` (full report) so mobile scrolls sideways.

### 4.4 Mobile (below `md` = 768px)

`md` is the app's one breakpoint: it is where the sidebar becomes a sidebar, the shell becomes a frame and
the header gets its room back. Everything below it has to be usable with one thumb on a 393px-wide phone.

| Concern | Rule |
| --- | --- |
| Navigation | `components/navigation.ts` holds the list; `Sidebar` renders it from `md` up, `MobileNav` renders the **same** list as a drawer below it. Never add a link to one of the two. |
| Drawer | Hamburger in the header → `fixed` panel (`w-72 max-w-[85%]`, `h-dvh`, `z-50`, `role="dialog"`, `aria-modal`). Closes on backdrop, the ✕, `Escape`, a route change and when the viewport reaches `md`; the page behind cannot scroll; focus goes in and comes back to the hamburger. Links are `py-3` (≈44px) — a touch target, not a desktop row. |
| Touch | No hover-only affordance: the schedule cell's `+ Thêm` is `opacity-100` below `md` and revealed on hover/focus from `md` up. Anything that only exists on `group-hover` is invisible *and* tappable on a phone. |
| Forms | Safari zooms the page when a focused field is below 16px, so `app/globals.css` forces `16px` on `input/select/textarea` under `max-width: 767px`. The rule sits **outside** every `@layer` so it outranks Tailwind's `text-xs`/`text-sm` utilities. |
| Modals | `max-h-[85dvh]` (not `92vh`: the iOS toolbar eats into `vh`), `p-4 sm:p-6`, and the wrapper is `items-end sm:items-center`, so a dialog rises from the bottom like a sheet on a phone and stays centred on a desktop. |
| Tables | Unchanged in shape: `overflow-x-auto` + `min-w-[…]`, so a phone swipes sideways. A cell whose content must not break carries `whitespace-nowrap` — the `/organization` invites table is the reference: without it the `Chờ vào tổ chức` pill wraps over three lines at 393px and stretches every row (header cells wrap too, so they need it as well). The first column is the row's identity (employee, ca, mã) — the place a sticky column would go if a screen needs it. |
| Map | `LocationPickerMap` keeps Leaflet's defaults: `h-64 w-full`, wheel zoom on a desktop, and on a phone one-finger drag pans the *map* and pinch zooms it — so a swipe over the map does not scroll the page (the fields and the modal around it do). That is the normal trade-off for a picker; the pin is placed by tapping, not by dragging it. |

---

## 5. Radii, borders & elevation

| Radius | Uses | Applied to |
| --- | --- | --- |
| `rounded-lg` | 84 | Buttons, inputs, selects, filter pills, timeline blocks — the default |
| `rounded-full` | 33 | Avatars, badges, search field, kbd hint, step counters |
| `rounded-xl` | 28 | Cards and panels (the standard container radius) |
| `rounded-md` | 28 | Tab buttons, small icon buttons, micro chips |
| `rounded-2xl` | 6 | Modals, dashboard tiles |
| `rounded-tr-sm` / `rounded-tl-sm` | — | Chat bubble tails only |

Borders & shadows:

- Container: `rounded-xl border border-slate-200/80 bg-white shadow-sm`.
- Modal: `rounded-2xl bg-white p-6 shadow-2xl` over a `bg-slate-900/40` scrim.
- `shadow-sm` is the only shadow used on surfaces (30 uses); `shadow-md` appears once as hover.
  `shadow-lg` is not used at all.
- Metric cards add a one-off accent rule: `border-b-2 border-b-blue-200`.
- Dashed placeholders / empty slots: `border-2 border-dashed border-slate-100 rounded-xl text-slate-400`.

---

## 6. Iconography

- `lucide-react` only, imported individually as named imports.
- Inline with text: `size={13}`–`size={17}`, coloured `text-slate-400` (neutral) or the semantic tone.
- Inside icon chips: `size={14}`–`size={16}` in an `h-8 w-8` / `h-9 w-9` chip
  (`flex items-center justify-center rounded-lg bg-blue-50 text-[#0C66E4]`).
- Brand mark: `h-8 w-8 rounded-lg bg-[#0C66E4] text-sm font-bold text-white` (Sidebar + Chat header).
- Loading is always `Loader2` with `className="animate-spin"`.
- Decorative icons that carry meaning (bell indicator, statuses) are paired with text or `aria-label`.

---

## 7. Component recipes

Copy these verbatim; they are lifted from shipped screens.

### 7.1 Page header

```tsx
<div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
  <div>
    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      Nhân sự / Bảng công
    </p>
    <h1 className="text-2xl font-bold tracking-tight">Xem bảng công</h1>
    <p className="mt-1 text-xs text-slate-500">Đối chiếu công, giờ làm…</p>
  </div>
  <div className="flex flex-wrap gap-2">{/* actions */}</div>
</div>
```

The eyebrow names the module (and the SCRUM ticket where the screen maps to one, e.g.
`Tài chính & thu / SCRUM-44`). Variant: the header can be a white card instead —
`rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm` — as in Báo cáo.

### 7.2 Surface / panel

```tsx
<section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
  <div className="flex flex-col gap-3 border-b border-slate-100 p-3">{/* toolbar */}</div>
  {/* content */}
</section>
```

### 7.3 KPI / metric card

```tsx
<article className="rounded-xl border border-slate-200/80 border-b-2 border-b-blue-200 bg-white p-4 shadow-sm">
  <div className="flex items-start justify-between gap-3">
    <p className="max-w-44 text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-slate-500">
      Tổng tiền đầu ca
    </p>
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0C66E4]">
      <Wallet size={16} />
    </span>
  </div>
  <p className="mt-5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">45.200.000 ₫</p>
  <p className="mt-1 text-[10px] text-emerald-600">+4,2% · so với tháng trước</p>
</article>
```

Tones for the icon chip: blue (`bg-blue-50 text-[#0C66E4]`), green (`bg-emerald-50 text-emerald-600`),
mint (`bg-teal-50 text-teal-600`), amber (`bg-amber-50 text-amber-600`). Deltas: emerald for up,
rose for down, amber for needs-attention.

### 7.4 Tabs & filter bar

Two tab styles coexist — pick by context:

```tsx
{/* Segmented tabs (Đơn từ, Thông báo): active = solid brand fill */}
<button className={`rounded-md px-3 py-2 text-xs font-semibold ${active
  ? "bg-[#0C66E4] text-white"
  : "text-slate-600 hover:bg-slate-100"}`}>Chờ duyệt</button>

{/* Compact segmented control (Chat): track + white thumb */}
<div className="flex gap-1 rounded-lg bg-[#F3F6FC] p-1 text-[10px] font-medium text-slate-500">
  <button className="rounded-md bg-white px-3 py-1.5 text-[#0C66E4] shadow-sm">Trang tổng quan</button>
  <button className="rounded-md px-3 py-1.5 hover:text-slate-800">Hội thoại</button>
</div>
```

Filter controls are label-wrapped selects with a leading icon and a transparent control inside:

```tsx
<label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
  <Filter size={14} />
  <select className="bg-transparent outline-none" value={branch} onChange={…}>
    <option value="all">Tất cả chi nhánh</option>
  </select>
</label>
```

Search inputs reuse the same pill: `rounded-lg border border-slate-200 bg-[#F8F9FF] px-3 py-2` with
`placeholder:text-slate-400`.

### 7.5 Buttons

| Variant | Classes |
| --- | --- |
| Primary | `inline-flex items-center gap-2 rounded-lg bg-[#0C66E4] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50` |
| Secondary | `inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50` |
| Tinted / soft | `rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-[#0C66E4] hover:bg-blue-100` |
| Destructive (outline) | `inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50` |
| Destructive (solid, confirm) | `rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50` |
| Success (approve) | `inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100` |
| Icon-only | `rounded-md p-2 text-slate-500 hover:bg-slate-100` |
| Cancel (in dialog) | `rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold` |

Always `inline-flex items-center gap-1…2` with a `size={13}`–`size={14}` icon; the loading state swaps
the label for `Đang lưu...` / `Đang xử lý...` and sets `disabled`.

### 7.6 Status badges

```tsx
<span className="rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700">Chờ duyệt</span>
```

Badge maps found in the code (extend, don't replace):

| Domain | Value | Label (vi) | Tone |
| --- | --- | --- | --- |
| Request | `PENDING` | Chờ duyệt | `bg-amber-50 text-amber-700` |
| Request | `APPROVED` | Đã duyệt | `bg-emerald-50 text-emerald-700` |
| Request | `REJECTED` | Từ chối | `bg-rose-50 text-rose-700` |
| Employee | `WORKING` | Đang làm | `bg-emerald-50 text-emerald-700` |
| Employee | `NOT_STARTED` | Chưa vào ca | `bg-amber-50 text-amber-700` |
| Employee | `ON_LEAVE` | Nghỉ phép | `bg-blue-50 text-blue-700` |
| Employee | `RESIGNED` | Nghỉ việc | `bg-slate-100 text-slate-500` |
| Attendance | `ON_TIME` | Đúng giờ | `bg-emerald-50 text-emerald-700` |
| Attendance | `LATE` | Trễ | `bg-amber-50 text-amber-700` |
| Attendance | `EARLY_LEAVE` | Về sớm | `bg-rose-50 text-rose-700` |
| Facility *(new, SCRUM-45/46)* | `GOOD` | Tốt | `bg-emerald-50 text-emerald-700` |
| Facility *(new, SCRUM-45/46)* | `BROKEN` | Hỏng | `bg-rose-50 text-rose-700` |
| Facility *(new, SCRUM-45/46)* | `NEEDS_MAINTENANCE` | Cần bảo trì | `bg-amber-50 text-amber-700` |

Counters use a neutral or blue pill: `inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[10px]
font-semibold text-blue-800` ("3 thông báo chưa đọc").

### 7.7 Table

```tsx
<table className="w-full min-w-[540px] text-left text-xs">
  <thead className="bg-[#F3F6FC] text-[9px] font-semibold uppercase tracking-wide text-slate-500">
    <tr>
      <th className="px-4 py-3">Nhân sự</th>
      <th className="px-4 py-3 text-right">Doanh thu ghi nhận</th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
      <td className="px-5 py-4">…</td>
    </tr>
  </tbody>
</table>
```

Rules: header `bg-[#F3F6FC]` in uppercase micro-type; numeric columns `text-right` + `tabular-nums`;
row separator `border-t border-slate-100`; money via `Intl.NumberFormat("vi-VN")`; wrap the table in an
`overflow-x-auto` container inside the section. The one grid-shaped table is `/schedules` (§8): the first
column is the row header (the ca and its hours, on `bg-app`), the seven day columns carry the date they
describe with today tinted `bg-blue-50/60`, and a cell stacks assignment blocks — `rounded-lg border px-2.5
py-2` tinted by status (emerald `SCHEDULED`, blue `LEAVE`, slate `CANCELLED`) with a 24px initials avatar,
the branch name, a status pill for anything but `SCHEDULED` and the note in `truncate`. A block keeps its
`Sửa` / `Xoá` icons (`text-slate-400` until hovered); a cell reveals a dashed `+ Thêm` on hover, because
only that cell knows the ca and the day being filled.

### 7.8 Modal / dialog

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
  <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
    <div className="flex items-start justify-between">
      <div>
        <h2 className="font-bold text-slate-900">Từ chối đơn nghỉ phép</h2>
        <p className="mt-1 text-xs text-slate-500">Lý do là bắt buộc theo yêu cầu nghiệp vụ.</p>
      </div>
      <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
    </div>
    {/* body */}
    <div className="mt-5 flex justify-end gap-2">{/* Hủy | Xác nhận */}</div>
  </div>
</div>
```

`max-w-md` for confirm/decision dialogs, `max-w-lg` for forms, always `z-50`. Destructive confirm sits
on the right, "Hủy" to its left. Quick-choice chips inside a dialog:
`rounded-full border px-3 py-1.5 text-xs`, selected = `border-blue-200 bg-blue-50 text-blue-700`,
unselected = `border-slate-200 text-slate-600`.

### 7.9 Form controls

```tsx
<label className="text-xs font-semibold text-slate-600">
  Nhân viên
  <select className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none">
    …
  </select>
</label>
```

Labels are `text-xs font-semibold text-slate-600`; controls are `rounded-lg border border-slate-200`
with `p-2.5 text-sm font-normal`. Textarea: `mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm
outline-none focus:border-blue-500`. Focus is signalled by `focus:border-blue-500` or
`focus:border-[#0C66E4] focus:ring-2 focus:ring-blue-500/15` (Header search).

### 7.10 Empty, loading, error states

```tsx
{/* Empty / placeholder */}
<div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-100 text-sm text-slate-400">
  Chưa có dữ liệu hoạt động
</div>

{/* Loading (button or inline) */}
<button disabled className="… disabled:opacity-50">Đang lưu...</button>
<Loader2 size={13} className="animate-spin text-[#0C66E4]" />

{/* Error banner (inside a form/panel) */}
<div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>
```

Inline page errors are reported with Vietnamese copy from the API (`data.error`) — never raw English
server messages. `last-updated` style metadata uses
`text-[10px] text-slate-400`.

### 7.11 Avatar

Initials-based, no photos anywhere in the admin UI:

```tsx
<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
  {name.split(" ").map((word) => word[0]).slice(-2).join("")}
</div>
```

### 7.12 Sidebar navigation

```tsx
<Link
  href={item.href}
  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
    isActive ? "bg-blue-50 font-semibold text-[#0C66E4]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  }`}
>
  <Icon size={17} className={isActive ? "text-[#0C66E4]" : "text-slate-400 group-hover:text-slate-600"} />
  {item.name}
</Link>
```

Section label above the list: `mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider
text-slate-400`. The brand block is the accent square + two-line name; the footer card is
`m-3 rounded-xl border border-blue-100 bg-[#F1F5FF] p-3` with the branch and shift summary. **Every new
screen must be added here** (lucide icon + Vietnamese label) so navigation stays complete.

Collapsed state: the same link without `gap-3 px-3`, with `justify-center px-0`, its label kept as
`sr-only` and repeated in `title` — an icon rail whose links have no accessible name is not shippable.
The section label becomes a `h-px bg-slate-100` rule, the footer card becomes the `OrganizationCard
compact` chip (`h-10`, `Landmark`, name in `title`), and the toggle (`PanelLeftClose` / `PanelLeftOpen`,
`aria-expanded` + `aria-controls`) stays in the same footer position in both states. The width is the
only animated property (`transition-[width] duration-200 motion-reduce:transition-none`).

### 7.13 Global search (Header)

Rounded search field on the header bar — `rounded-full border border-slate-200 bg-[#F8F9FF] py-2 pl-10
pr-14 text-xs` with a leading `Search size={16}` and a trailing `kbd` hint (`⌘K`). Results render in an
absolute panel: `absolute mt-2 w-full rounded-xl border border-slate-100 bg-white shadow-lg` with rows
`px-4 py-2 hover:bg-slate-50` — title `text-sm font-medium text-slate-900` and type
`text-xs uppercase text-slate-500`. The states are `Đang tìm kiếm...` (with `Loader2`) and
`Không tìm thấy kết quả nào`.

### 7.14 Chat (AI assistant)

Transcript canvas `bg-[#FBFCFF]`. User message: right-aligned bubble
`ml-auto max-w-[88%]` + `rounded-xl rounded-tr-sm bg-[#0C66E4] px-4 py-3 text-xs text-white shadow-sm`
with a `bg-blue-100 text-[#0C66E4]` avatar. Assistant message: white
`rounded-xl rounded-tl-sm border border-slate-200/70 bg-white p-4 shadow-sm` card with a brand-square
avatar, the answer text in `whitespace-pre-line`, a `BookOpen` source line in
`text-[10px] font-semibold text-[#0C66E4]`, and a `<details>` block listing the real retrieved
chunks — one row per source with its name (truncated) and a `Độ liên quan 87%` chip derived from the
vector search's cosine similarity. Thinking state: `Loader2 animate-spin` +
`Đang tra cứu tài liệu nội bộ...`; a failed call renders a rose card in the transcript with a
`Thử lại` button instead of losing the question.

The screen is wired to `POST /api/chat/ask` (the Chat AI module, documented in Vietnamese) and keeps
the conversation in component state only: there is no history endpoint, so the rail shows suggested
questions and the answer's citations rather than a fake "recent conversations" list, and nothing on
the screen invents a confidence score or a step list the endpoint never returned.

### 7.15 Alert / warning card

```tsx
<div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
  <p className="text-[10px] font-semibold uppercase text-slate-400">{label}</p>
  <p className="mt-1 text-xl font-bold text-amber-800">{value}</p>
</div>
```

Use for reconciliation mismatches (`Chênh lệch`), radius/geofence warnings and facility alerts. Neutral
variant uses `border-slate-200 bg-white text-slate-900`.

---

### 7.16 Inbox (Thông báo) — SCRUM-48 + SCRUM-70/71/72

The inbox is a **read surface**: every row is written by a database trigger (`SCRUM-70/71/72`), so the
screen never composes a notification — it labels, groups and links what it finds.

| Element | Recipe |
| --- | --- |
| Page header | eyebrow `Hệ thống / SCRUM-48 · SCRUM-70`, then `Tải lại` and `Cài đặt kênh nhận` (secondary) plus `Đánh dấu tất cả đã đọc` (solid brand) |
| Filter bar (§7.4) | Two rows: solid segmented tabs `Tất cả / Chưa đọc / Đã đọc`, then soft group chips (`bg-blue-50 text-primary`, `border-primary`) carrying the group icon — `Tất cả nhóm`, `Doanh thu`, `Đơn từ`, `Lịch làm việc`, `Chấm công`, `Nhân sự`, `Chi nhánh`, `Thiết bị`, `Tổ chức`. Each chip sets `aria-pressed`; the row is `role="group"` + `aria-label="Nhóm thông báo"` |
| Row | 32px tinted icon (blue when unread, slate when read), title, body (the trigger's Vietnamese sentence), then `timestamp · <nhóm>` — never the raw `type` code |
| Row actions | `Xem` — a link to the entity's screen, rendered only when `canAccessScreen` allows that role — and `Đã đọc` on an unread row |
| Empty state | One plain sentence naming the real events, and when a filter is on, saying the filter is the reason |
| Settings drawer | `Trong ứng dụng` (on by default and honoured by the fan-out), `Email` / `Thông báo đẩy` labelled *chưa được cấu hình*: the drawer must not imply a delivery that does not exist |
| Live | 30s `setInterval` refresh (skipped while the tab is hidden) and the same 30s poll on the header bell — no spinner for a poll |

---

## 8. Content, number & i18n conventions

- **Copy is Vietnamese.** Labels are short, verb-first and sentence case except the uppercase eyebrows:
  `Xem bảng công`, `Quản lý duyệt đơn nghỉ phép`, `Đánh dấu tất cả đã đọc`, `Lưu thay đổi`.
- **Two languages, one source of truth (vi / en).** The copy lives in `lib/i18n/messages/vi.ts` (the source
  language) and `messages/en.ts`, both shaped by `Translations` = `Record<MessageKey, string>`, so a key added
  on one side and forgotten on the other fails `npx tsc --noEmit`. Components read it with
  `const { t } = useLocale()` (`components/LocaleProvider.tsx`) and `t("header.signOut")`;
  `components/navigation.ts` stores a `labelKey`, never a label. The active locale is the `humora-locale`
  cookie — `app/layout.tsx` reads it on the server so `<html lang>` and the first paint are already right —
  and `components/LanguageToggle.tsx` switches it: one box on every width (globe, active code, caret) that
  opens a menu of the languages with their flags and native names, closing on outside click / Escape like
  the header's search dropdown. A screen that has not been migrated yet keeps its Vietnamese literals and
  renders exactly as before: migrate screen by screen, never in one sweep. A **public** screen carries the
  switch itself — `/login` and `/register` render `LanguageToggle` in their card, because `Header` returns
  `null` on a public path and a visitor who has never signed in must still be able to reach English.
- **Migrating a screen (the recipe `/organization` established).** The screen reads
  `const { locale, t } = useLocale()`, every literal becomes `t("organization.…")`, and the module-level
  helpers (`accountErrorMessage`, `actionErrorMessage`, `provisioningNote`) take `t` as their last argument,
  because a function outside the component has no hook. `formatDateTime(value, locale)` follows the reader's
  language while the business time zone stays `Asia/Bangkok`. A literal used as an attribute value needs
  `aria-label={t("…")}`, and JSX copy needs braces *and* its own indentation (`{t("…")}`) — a bare `t(…)` in
  a text position does not compile. A migrated screen has no Vietnamese line left at all.
- **Shared labels.** A vocabulary several screens render — a role, a notification category or type code, an
  attendance / shift / employee / request status, a passkey failure — is a **dictionary key** held by
  `lib/i18n/labels.ts`, `roleLabel()` (`lib/accessPolicy.ts`), `notificationTypeLabel()` /
  `notificationCategoryLabel()` (`lib/domain/notificationCatalog.ts`) and `passkeyErrorMessage()`
  (`lib/domain/passkeyMessages.ts`). Each helper takes `t` as its **last, optional** argument and defaults to
  the Vietnamese source, so nothing renders differently until the screen that calls it opts in, and a code the
  vocabulary does not know renders itself instead of a blank pill. `requests.request_type` is stored *as* its
  label: the display is translated, the value that is sent and filtered on never is.
- **Server sentences are Vietnamese.** Anything a caller can see — an `error` payload, a domain error's
  message, the Edge Function's answers — is Vietnamese, because the app is Vietnamese-first and the screen
  often shows that sentence verbatim. Repository/`console.error` diagnostics (`Unable to load …: ${error.message}`)
  deliberately stay English: they sit in the log next to Postgres' own English text and never reach a caller.
  A route that decides a status by matching a message has to match a token that survives translation — the
  field name (`startsWith("status")`) or the Vietnamese phrase — and both sides change in the same commit
  (`app/api/organizations/_lib/organizationErrorResponse.ts` is the reference).
- **Currency:** `formatCurrency(amount, locale)` from `lib/i18n/format.ts` → `24.850.000 ₫` (`vi`) /
  `24,850,000 ₫` (`en`); never a new `new Intl.NumberFormat("vi-VN")` in a screen. Zero variance reads
  `0 ₫`, and a delta carries an explicit sign (`+50.000 ₫` / `-150.000 ₫` from `formatSignedCurrency`).
- **Dates & times:** `lib/i18n/format.ts` — shift labels `T2 05/10` / `Mon 05/10`, ranges `28/10 – 29/10`,
  clock `14:00 – 23:00` (24-hour in both languages), timestamps `09:24`. English formats as **`en-GB`** so a
  date never turns into "May 10th", the zone is always `Asia/Bangkok` whatever the reader's language is, and
  `formatDayMonth` joins the `YYYY-MM-DD` string instead of using `Intl`, whose `vi-VN` short date is `05-10`.
- **English glossary (one wording per term, across every screen):** chi nhánh → *branch*; ca (làm việc) →
  *shift*; bảng công → *timesheet*; chấm công → *attendance* (the `/check-in` screen is *Check-in*); giờ công
  → *worked hours*; đơn từ → *request*; khiếu nại → *complaint*; doanh thu → *revenue*; đối soát →
  *reconciliation*; nghỉ phép → *leave*; nhân sự → *staff*; thiết bị → *facility*; tổ chức → *organization*;
  chủ sở hữu → *owner*; quản lý chi nhánh → *branch manager*; nhân viên → *employee*.
- **Percentages** use a comma decimal separator: `+4,2%`, `Đạt 108% KPI`.
- **Code, identifiers, comments and file names stay English** (see `AGENTS.md`). The only exception is
  the Chat AI module, which is documented in Vietnamese.
- **Empty states** are plain sentences, never apologetic: `Chưa có dữ liệu hoạt động`,
  `Không tìm thấy kết quả nào`.
- **Ticket traceability:** the page eyebrow often carries the SCRUM id (`Nhân sự / SCRUM-41`,
  `Tài chính & thu / SCRUM-44`, `Trung tâm điều hành thông báo / SCRUM-48`). Keep that habit for new
  screens so the UI and the backlog stay linked.

---

## 9. Interaction & accessibility conventions

| Topic | Convention in the codebase |
| --- | --- |
| Focus | `focus:border-[#0C66E4] focus:ring-2 focus:ring-blue-500/15` (search), `focus:border-blue-500 outline-none` (inputs) |
| Hover | Surfaces: `hover:shadow-md transition-shadow`; rows: `hover:bg-slate-50/70`; buttons darken one step (`hover:bg-blue-700`, `hover:bg-blue-100`) |
| Disabled | `disabled:opacity-50` plus `disabled:cursor-not-allowed` on destructive confirms |
| Selected | Solid brand fill `bg-[#0C66E4] text-white`, or `bg-blue-50 text-[#0C66E4]` for soft selection |
| Transitions | `transition-colors` on controls, `transition-shadow` on cards; nothing longer/exotic |
| Labelling | Interactive filters carry `aria-label` (`Chi nhánh`, `Kỳ báo cáo`, `Tìm thông báo`); grouped buttons use `role="group"` + `aria-label` |
| Destructive actions | Guarded with a native `confirm()` in the admin screens (e.g. deleting a shift) and a mandatory reason inside the reject dialog |
| Data refresh | Pages use `fetch(..., { cache: "no-store" })`, a manual `Làm mới` button, and — on giám sát screens — a 60s `setInterval` poll. The inbox and the header bell poll every 30s instead (a notification arrives while the screen is open) and hide the spinner for a poll |
| Loading | Button label swap + `Loader2 animate-spin`; skeletons are not used yet |
| Feedback | Inline error banners (rose) for form failures — the review flow now uses one too, instead of the `alert()` it used while it ran on the mock store |

---

## 10. Screen inventory & navigation map

Current `Sidebar` order (module → route → icon):

| Label (vi) | Route | Icon |
| --- | --- | --- |
| Tổng quan | `/` | `LayoutDashboard` |
| Quản lý chi nhánh | `/branches` | `Building2` |
| Cơ sở vật chất | `/facilities` | `PackageSearch` |
| Doanh thu | `/revenue` | `CircleDollarSign` |
| Đơn từ | `/requests` | `FileText` |
| Lịch làm việc | `/schedules` | `CalendarRange` |
| Trạng thái nhân viên | `/employee-status` | `UserCheck` |
| Chấm công | `/check-in` | `Fingerprint` |
| Bảng công | `/attendance` | `ClipboardCheck` |
| Quản lý nhân sự | `/staff` | `UsersRound` |
| Báo cáo | `/reports` | `PieChart` |
| Thông báo | `/notifications` | `Bell` |
| Trợ lý AI | `/chat` | `Bot` |
| Bảo mật | `/security` | `ScanFace` |

Sibling screens outside the sidebar: `/login` (sign-in — it hides the shell), `/register`
(self-registration — hides the shell too, same card recipe with a fourth "Xác nhận mật khẩu" field),
`/api-docs` (Swagger UI). Both are listed in `lib/publicPaths.ts`, which is what `proxy.ts`, `Header`
and `Sidebar` read.

The organization screen (`/organization`, SCRUM-51/52) is intentionally **not** a navigation entry: it
is a one-off setup step, so the sidebar's organization card (`Landmark` + name + member count) links to
it, and `proxy.ts` sends an account without an organization to `/onboarding` instead — the same link
therefore works for the owner (manage code and accounts) and for a newcomer (create or join). Onboarding
screens hide the navigation through `SHELL_LESS_PATHS` while keeping the header, so the account can
still sign out.

Screens required by the in-flight epics, following the same header/card/badge language:

| Feature | Ticket | Suggested route | Suggested label (vi) | Suggested icon |
| --- | --- | --- | --- | --- |
| Chi nhánh (branch + manager + radius) | SCRUM-47 | `/branches` ✅ built | Quản lý chi nhánh | `Building2` |
| Đăng ký tài khoản nội bộ | SCRUM-50 | `/register` ✅ built | Đăng ký | `UserRound` |
| Cơ sở vật chất theo chi nhánh | SCRUM-45/46 | `/facilities` ✅ built | Cơ sở vật chất | `PackageSearch` |
| Lịch làm việc (phân ca theo tuần) | SCRUM-30 | `/schedules` ✅ built | Lịch làm việc | `CalendarRange` |
| Chấm công (check-in/out + ảnh + toạ độ) | SCRUM-21/22/29 | `/attendance` ✅ built (web review side) | Bảng công | `ClipboardCheck` |
| Chấm công trên web (vào ca / ra ca, GPS, không ảnh) | SCRUM-68 | `/check-in` ✅ built | Chấm công | `Fingerprint` |
| Sửa giờ + xử lý khiếu nại | SCRUM-23 | `/attendance` ✅ built (dialog + badge, no new route) | Bảng công | `Pencil` / `Check` |
| Quản lý nhân sự (vai trò, nghỉ việc) | SCRUM-24 | `/staff` ✅ built | Quản lý nhân sự | `UsersRound` |
| Tổ chức + mã tham gia + danh sách tài khoản | SCRUM-51 | `/organization` ✅ built | Tổ chức | `Landmark` |
| Tạo hoặc gia nhập tổ chức | SCRUM-51 | `/onboarding` ✅ built (shell-less) | Bắt đầu | `Landmark` / `KeyRound` |
| Tài khoản do chủ sở hữu tạo (mật khẩu tạm) | SCRUM-52 | `/change-password` ✅ built (shell-less) | Đổi mật khẩu | `KeyRound` |
| Đăng nhập nhanh bằng Face ID / Passkey | SCRUM-79 | `/security` ✅ built (+ nút ở `/login`) | Bảo mật | `ScanFace` |

Check-in/check-out themselves were mobile-first (`hr_mobile_app`); since SCRUM-68 the web records them too,
so `/check-in` (vào ca / ra ca) writes the row and `/attendance` stays the **manager's** review screen (ảnh
xác minh + toạ độ + trạng thái hợp lệ + sửa giờ) — `attendance:view` is no longer an employee capability, and
the employee's own timesheet is the 30-day list on `/check-in`. Two states the screen must get right:
a check-out stores `EARLY_LEAVE` only onto an `ON_TIME` row (a late arrival never loses its `LATE`), and while
the ca is still running the same button re-opens the row ("Vào ca lại") instead of creating a second one —
re-deriving the arrival verdict from the stored giờ vào, never from the status column a previous write left
behind. "Giờ làm" counts only the worked segments (SCRUM-69: the pause between "Ra ca" and "Vào ca lại" is not
working time), so both screens read it from `effectiveWorkedHours` rather than subtracting the two timestamps —
and a ca nobody closed ends at the **ca's end time** (SCRUM-75), rendered as `09:14 → 17:00` plus a grey
**tự động** chip and the tooltip "Nhân viên không bấm Ra ca…", because a forgotten click is a fact the reviewer
must be able to see. The inference is only drawn for a row with no giờ ra once the ca's end has passed (a real
check-out always wins, a running ca keeps `--:--`, and no `EARLY_LEAVE` is ever derived from it), and the
"Sửa giờ" dialog pre-fills it so one save records it as a real check-out. The
organization's `OWNER` never clocks in — the capability `attendance:checkin` is filtered out of their row, so
the link is not rendered and the API answers `403`; `attendance_insert_own` (SCRUM-68) repeats the rule in the
database. No photo from the browser: there is no Storage bucket, so `check_in_photo_url` stays null and the
review screen shows "Ảnh xác minh: —". The screen carries a "Chỉ công của tôi" toggle for the account that runs
it: a manager and the owner track the organization here, and their own ca must be findable in the same list
(it travels to the API as `employee_id`, so the KPI cards and the table agree).

---

## 11. Do & Don't

**Do**

- Reuse `#0C66E4` + `blue-50` tints, `rounded-xl` cards, `border-slate-200/80`, `shadow-sm`.
- Keep the page rhythm: header block → toolbar/tabs → content sections, spaced with `space-y-5`.
- Express every state with a coloured badge from §7.6, next to text.
- Use `tabular-nums` for money and `Intl.NumberFormat("vi-VN")` for output.
- Add every new screen to `components/Sidebar.tsx` and give it an icon + Vietnamese label.
- Keep copy Vietnamese, identifiers English.

**Don't**

- Don't introduce a second accent colour, gradients, glassmorphism or heavy shadows (`shadow-lg`+).
- Don't add a new font; Be Vietnam Pro is the single family.
- Don't use `text-base`/`text-3xl`; the scale runs `text-[9px]…text-2xl`.
- Don't hardcode demo arrays in a screen — wire it to `/api/*` (or mark it clearly as a prototype).
- Don't widen the palette with the one-off hexes (`#F4B740`, `#11A879`, `#E6ECF5`, `#e8edf5`).
- Don't remove or bypass `@swagger` blocks when touching a route, and don't hand-edit
  `public/swagger.json`.

---

## 12. Checklist for a new screen

1. `app/<segment>/page.tsx`, default export, `"use client"` only if it has state/effects/browser APIs.
2. Root `<div className="space-y-5">` + §7.1 header (eyebrow with the SCRUM id, H1, description, actions).
3. Sections as §7.2 panels; filters as §7.4 pills; empty/loading/error states as §7.10.
4. Vietnamese copy, `vi-VN` numbers/dates, badges from §7.6 — or a `t()` key (§8) when the screen is being
   migrated to the second language.
5. Register the screen in `components/navigation.ts` (icon + Vietnamese `labelKey`) — never in `Sidebar` or
   `MobileNav` directly, since both render that one list.
6. Wire to `/api/*` (never a demo array), handle `401`/`403`/`400` with a rose banner.
7. If you added a route: JSDoc `@swagger` block + shared schema in `lib/swagger.ts`.
8. Verify: `npx tsc --noEmit`, `npx eslint <files you touched>`, then open the page and `/api-docs`.

---

## 13. Where the tokens live & known gaps

| Concern | File |
| --- | --- |
| Colour tokens, font wiring | `app/globals.css` (`:root` + `@theme inline`) |
| Font loading, shell, `max-w-[1440px]` | `app/layout.tsx` |
| Navigation, brand block, branch footer card | `components/Sidebar.tsx` |
| Navigation list (one source), phone drawer | `components/navigation.ts`, `components/MobileNav.tsx` |
| Locale, dictionaries, `t()`, language switch | `lib/i18n/**`, `components/LocaleProvider.tsx`, `components/LanguageToggle.tsx` |
| Global search, notification bell, user card | `components/Header.tsx` |
| `text-[10px]` eyebrow convention | every `app/*/page.tsx` |

Known inconsistencies to fix when the relevant screen is next touched (do not mass-refactor):

1. `--primary` is declared but not exposed as `--color-primary`, so screens hardcode `#0C66E4`.
   Mapping it in `@theme inline` would allow `bg-primary` — a behaviour-preserving cleanup.
2. `shadow-md` is used once as a hover effect on dashboard tiles while every other card uses
   `shadow-sm`; normalise if the dashboard is reworked.
3. Every admin screen is now formatted like the rest (§4, §7) and reads a real table or RPC — the last
   minified page (`employee-status`) and the in-memory mock store went together with SCRUM-22. Keep new
   screens in that shape instead of reintroducing demo arrays.
4. The metric-card accent rule (`border-b-2 border-b-blue-200`) is currently only in Báo cáo; adopt it
   for new KPI rows so dashboards read consistently.
5. `/login` and `/register` escape the shell because `Sidebar`/`Header` return `null` for the paths in
   `lib/publicPaths.ts` (`isPublicPath(usePathname())`). Moving the nine authenticated screens into an
   `app/(dashboard)/` route group with its own layout is the cleaner long-term shape — a mechanical move,
   worth doing once no feature branch is in flight.
6. `/branches` now assigns a branch manager: the picker reads the SCRUM-24 staff directory (`GET /api/users`
   without `id`, `OWNER`/`MANAGER` only — SCRUM-59 `directory:view` — the staff-list endpoint that was
   missing before), sends `manager_id` with the branch, and the table shows the name and role when the
   directory is readable, falling back to the `Đã gán` badge for a role without it. The address field is
   filled by reverse geocoding (`GET /api/geo/reverse` → Nominatim, the same project as the map tiles)
   whenever the pin moves, and stays editable by hand.
7. `/schedules` (SCRUM-30) replaced the old mock `/shifts` screen: the nav label changed from "Xếp ca" to
   "Lịch làm việc" and the route moved to `/schedules`, so `app/shifts/page.tsx` no longer exists. The
   schedule modal now picks a person with a combobox over the SCRUM-24 directory (`GET /api/users`): it
   opens on the first click, filters while the name is typed (diacritics optional, `lib/searchText.ts`), and
   offers only accounts whose `is_active` is true — the earlier `GET /api/search?type=users` flow needed two
   characters and a click on "Tìm", and could not tell an employee who had quit from one who still works. Its
   "Ca làm việc" `<select>` reads the per-organization catalogue, so an unseeded organization gets a hint
   naming `supabase/sql/SCRUM-58_shift_catalogue.sql` instead of an unexplained empty list. The week is a
   table now (§7.7): one row per ca with `Nghỉ` last, seven day columns, one block per assignment, and the
   picker ordered by the same `compareShiftsByStartTime`. The `MockShift`
   helpers mentioned here are gone: SCRUM-22 deleted `lib/mock/adminStore.ts`.
8. `/facilities` and `/schedules` are the first screens with **pills for one dimension + `<select>`s for
   another** (facilities: condition pills + branch/category selects; schedules: status pills + branch
   select). Adopt that split on the next filter row: pills for a short closed set read at a glance, selects
   once there are more than ~5 options or the labels are long.
9. The tenant model (SCRUM-51/53) is **not isolation until `SCRUM-53_tenant_scope.sql` is applied**: with
   SCRUM-51 alone an organization is a join gate, while the operational tables are still readable by every
   signed-in account. Both screens added by these tickets (`/organization`, `/onboarding`) and the
   shell-less pattern they follow are described in §10; do not describe an organization as isolating data
   to a user before that script has run.
10. `/organization` offers "Tạo tài khoản cho nhân viên" only when `GET /api/organizations/accounts`
    answers `available: true`, i.e. when the `staff-account` Edge Function is deployed (SCRUM-52). Without
    it the screen shows a note and the invite path, which is deliberate: a button that always fails is
    worse than a sentence explaining why.

11. Three roles, not two (SCRUM-59): `OWNER` / `MANAGER` / `EMPLOYEE`, where the middle level is what
    `CHU` used to mean. The navigation is no longer a fixed list — `components/Sidebar.tsx` filters it
    through `useProfile().can(…)`, `proxy.ts` sends a deep link the role may not open to
    `firstAccessiblePath`, and a page hides a control the role may not use instead of letting the click
    reach a `403`. The visible consequences are deliberate:
    - a manager (`branch:view` without `branch:manage`) opens `/branches` **read-only** — the header has no
      "Thêm chi nhánh" and the row's action column reads "Chỉ xem" instead of "Chỉnh sửa";
    - an employee (`request:view`, `schedule:view`, `attendance:checkin`) opens `/requests` as "Đơn từ của
      tôi", `/schedules` without "Xếp ca / Sửa / Xoá" (their own ca are the schedule they see), and
      `/check-in` for vào ca / ra ca and their own 30-day timesheet. They hold no `attendance:view`, so
      `/attendance` — the Bảng công review screen — is not in their sidebar and a deep link is bounced
      (SCRUM-68: it only ever held reviewer actions, which need `attendance:review`);
    - `/requests` also *submits*, but never for the owner: "Tạo đơn" (`request:create`) opens a dialog with
      the đơn type (`REQUEST_TYPES`), the branch, a title and an optional note, and posts it as the caller's
      own `PENDING` row — the same queue a manager then reviews, which is what closes the loop the screen
      previously only read from. The owner holds no `request:create` (SCRUM-63): they sit above the approval
      chain and review every đơn instead of filing one;
    - `/revenue`, `/reports`, `/employee-status`, `/facilities`, `/staff` and `/organization` are gone from
      an employee's sidebar entirely, and the capability table in `lib/accessPolicy.ts` is the single place
      that decides it.
    Keep the copy in Vietnamese, keep the state pill next to a now-absent button (never leave a blank
    cell), and remember that the colour tokens (`bg-surface`, `bg-primary`, `text-primary`) are what make
    these screens work in dark mode.

12. Branch scope and deletion (SCRUM-61). A chi nhánh trưởng (`branches.manager_id`) manages only their
    branch, and the UI has to *show* that instead of letting the click reach a `403`:
    - every picker whose value is the target of a write (the revenue branch select, the "Chi nhánh" field
      of the facility modal) renders the branches the caller does not head as `disabled` options labelled
      `— chỉ xem`, and opens on the caller's own branch
      (`defaultBranchId`) rather than on whichever row the API sorted first;
    - the **Chi nhánh trưởng** field of the branch modal lists only `OWNER`/`MANAGER` accounts (`isManagerRole`
      over the SCRUM-24 directory): an employee is not offered, and the API answers `400` if one is sent;
    - the row actions of `/branches`, `/schedules`, `/attendance`, `/facilities` and `/requests` read
      **Chỉ xem** for a branch outside the caller's scope, in the same right-aligned cell the buttons
      would occupy, so the table never shows a blank action column;
    - **read filters stay usable** (`/attendance`, `/employee-status`, `/requests`, `/schedules`,
      `/facilities`): SCRUM-60 deliberately lets a manager read the whole organization, and graying a
      filter would hide data the screen exists to browse. Only the write surfaces narrow;
    - `/branches` gains a **Xoá** button (owner only) behind `window.confirm`, and the `409` it can answer
      is rendered verbatim in the page banner — the sentence names how much attendance, schedule,
      facility and revenue data still points at the branch, which is what the operator has to move or
      remove first. A branch that still has history is never auto-cascaded: deleting one would take
      bảng công, ca làm việc and thiết bị with it and orphan `daily_revenue`.
    - **Nhân viên thuộc một chi nhánh** (SCRUM-63): `/staff` gains a **Chi nhánh** column — one select per
      row with a "Chưa gán chi nhánh" option, saved by the same **Lưu** button as the role, and an
      unassigned row carries the amber note "Chưa gán: không thấy ca, bảng công hay gửi được đơn". The
      search box matches the branch name too, so the owner can review one chi nhánh at a time;
    - `/requests` shows an employee their branch as a *statement* ("Đơn luôn thuộc chi nhánh bạn làm việc")
      rather than a picker, hides **Tạo đơn** for an account with no branch, and the empty queue explains
      it: "Bạn chưa được gán chi nhánh — nhờ chủ sở hữu gán chi nhánh ở trang Quản lý nhân sự để gửi đơn".
      A branch head no longer sees **Duyệt** / **Từ chối** on their own đơn either: that row reads
      **Đơn của bạn**, because only the organization's owner may decide it (`ReviewRequestUseCase`) — and
      the owner keeps the buttons on their own row for exactly the same reason.
    - **Chủ sở hữu không thuộc một chi nhánh nào** (SCRUM-63): their `/staff` row shows a locked "Không gán
      chi nhánh" cell instead of a select, and the **Chi nhánh trưởng** picker on `/branches` no longer
      offers them — only a `MANAGER` heads a branch. A branch whose stored head is the owner (or a legacy
      employee) is flagged in the table ("… không phụ trách chi nhánh — cần gán quản lý chi nhánh"), and
      opening its modal explains why the field is empty, so the operator re-assigns a manager;
    - a **manager's** `/staff` row shows no picker either — just the grey "Phụ trách: …" line read from
      `branches.manager_id` (or "Chưa phụ trách chi nhánh nào — vẫn xem được toàn tổ chức") — never the
      amber "Chưa gán: không thấy ca, bảng công hay gửi được đơn" warning, which would be false: a manager
      reads the whole organization (SCRUM-60). Both that warning and the select are reserved for an
      `EMPLOYEE`, the only role the branch narrowing actually constrains;
    - **`/schedules` is scoped to the branches the caller runs** (SCRUM-63): the branch filter and the
      modal's "Chi nhánh" field list `scopedBranches` (every branch for the owner, the headed ones for a
      manager) instead of graying the others out, the week table and the four KPI cards count the same rows
      (`visibleAssignments`), and the employee combobox offers **only** `EMPLOYEE` accounts of those
      branches — each row labelled with their chi nhánh instead of the role, which is now always "Nhân
      viên". A manager who heads no branch reads "Bạn chưa phụ trách chi nhánh nào nên chưa xếp ca được";
    - the **header** prints that same scope under the account name: the branch a manager heads (joined
      with ", " when they head several, truncated to 13 rem with the full text in `title`), or the
      employee's own branch ("Chưa gán chi nhánh" while unassigned) — and nothing at all for the owner.

---

## Tóm tắt (Tiếng Việt)

- `design.md` là tài liệu tham chiếu giao diện cho web admin Humora, được tổng hợp trực tiếp từ các
  màn hình hiện có: nền `#F8F9FF`, màu thương hiệu `#0C66E4`, chữ **Be Vietnam Pro** (400–700),
  bo góc `rounded-lg` cho điều khiển và `rounded-xl` cho khung, chỉ dùng `shadow-sm`.
- Quy ước quan trọng: mỗi trang là `space-y-5` với khối tiêu đề (eyebrow `text-[10px]` in hoa → H1
  `text-2xl font-bold` → mô tả `text-xs text-slate-500`); trạng thái luôn là pill màu
  (xanh lá = hợp lệ, vàng = chờ, đỏ = lỗi, xanh dương = thông tin, xám = ngừng); số tiền định dạng
  `Intl.NumberFormat("vi-VN")` và dùng `tabular-nums`.
- Nội dung tiếng Việt, mã nguồn/định danh tiếng Anh. Màn hình mới phải khai báo trong
  `components/Sidebar.tsx` (icon lucide + nhãn tiếng Việt) và nối với `/api/*` thay vì dữ liệu mẫu.
- Phân quyền ba cấp (SCRUM-59): `OWNER` / `MANAGER` / `EMPLOYEE` — bảng năng lực nằm ở
  `lib/accessPolicy.ts`, `proxy.ts` chặn deep link, `Sidebar` lọc link, trang ẩn nút bằng
  `useProfile().can(…)`, route handler trả `403` bằng `requireCapability(…)`, còn RLS mới là nơi quyết
  định dữ liệu. Không tự viết lại danh sách vai trò trong trang: thêm năng lực vào bảng là đủ.
- Phạm vi chi nhánh (SCRUM-61): trưởng chi nhánh (`branches.manager_id`) chỉ quản lý chi nhánh mình phụ
  trách. Ở nơi **ghi** dữ liệu, chi nhánh không thuộc quyền bị mờ (`disabled`, nhãn "— chỉ xem") và màn
  hình mở sẵn đúng chi nhánh của người dùng; ở bảng, dòng ngoài phạm vi hiển thị "Chỉ xem" thay cho nút.
  Bộ lọc chỉ để **đọc** vẫn dùng được bình thường — đọc không phải là quản lý.
- Mục 12 là checklist dựng màn hình mới; mục 13 liệt kê các điểm chưa nhất quán (nên sửa khi động vào
  màn hình tương ứng, không sửa hàng loạt).
