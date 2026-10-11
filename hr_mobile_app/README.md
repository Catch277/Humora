# HR & Chấm công — Mobile app (`hr_mobile_app`)

Employee-facing Flutter client of the **HR & Attendance Management System** — the HUFLIT coursework
project whose other parts live in the sibling folders `../hr_website` (manager admin web app) and
`../landing_website` (marketing site). Employees sign in, see their shift schedule and, eventually,
check in with face + GPS/Wi-Fi validation, view payslips and read company notices.

> **Status: UI prototype.** Every screen is static mock UI with placeholder text and only one
> navigation link is wired (Home → Work schedule). See [Current status](#current-status-and-limitations).

## Screens

| Route                      | File                                     | What it shows today                                                                                                                                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` and `/login` (initial) | `lib/models/login_screen.dart`           | Slide-up login card over a `bg.png` hero image, Email + Password fields, "Remember me", "Forgot password?" — the submit action is not wired yet          |
| `/employee/home`           | `lib/models/home_employee.dart`          | Time-based greeting, employee header, quick actions "Chấm công" / "Lương: số tiền", a 2×2 "Tiện ích" grid (Lịch làm việc, Phiếu lương, Bảng công, Bản tin) and a 4-tab bottom bar |
| `/employee/workschedule`   | `lib/models/work_schedule_employee.dart` | "Lịch làm việc" screen with three category cards: Lịch sử chấm công, Đăng ký ca làm, Lịch phân ca (taps not wired)                                       |

Named routes are declared in `lib/routes/app_routers.dart` and registered on `MaterialApp` in
`lib/main.dart`. The app starts at `AppRoutes.login`.

## Tech stack

| Concern       | Choice                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Framework     | Flutter stable 3.44.x, Dart SDK `^3.12.2`                                                        |
| Backend client| `supabase_flutter ^2.17.2` — initialised in `main.dart`, **not queried anywhere yet**             |
| State         | Plain `setState`; no bloc/provider (`lib/presentation/blocs` is an empty placeholder)            |
| Icons         | `cupertino_icons ^1.0.8`                                                                         |
| Lints         | `flutter_lints ^6.0.0` through `analysis_options.yaml` (platform folders and `build/**` excluded) |
| Targets       | android, ios, linux, macos, web, windows — all six platform folders exist                        |

## Project structure

```text
hr_mobile_app/
├── lib/
│   ├── main.dart                    Supabase.initialize + MaterialApp (routes, path URL strategy)
│   ├── routes/app_routers.dart      Named routes: /login, /employee/home, /employee/workschedule
│   ├── models/                      ⚠ the screens live here: login_screen.dart,
│   │                                home_employee.dart, work_schedule_employee.dart
│   ├── widgets/                     bottom_nav_bar.dart, stat_card_employee.dart,
│   │                                dropdown_filter_employee.dart, work_schedule_item_card.dart
│   ├── core/                        empty placeholders: error/, network/, utils/
│   ├── data/                        empty placeholders: datasources/{local,remote}/, models/, repositories/
│   ├── domain/                      empty placeholders: entities/, repositories/, usecases/
│   └── presentation/                empty placeholders: blocs/, pages/
├── assets/images/bg.png             The only asset — login hero image and every avatar
├── test/widget_test.dart            Default counter smoke test (fails today)
├── android/ ios/ linux/ macos/ web/ windows/   Platform shells (Android id: com.example.hr_mobile_app)
└── pubspec.yaml                     Dependencies, assets and lint setup
```

The empty `core` / `data` / `domain` / `presentation` folders hint at an intended clean-architecture
layout (the same idea as `../hr_website/lib`), but no code has moved there yet — and since Git does not
track empty directories, those folders exist only in a local checkout.

## Getting started

```bash
cd hr_mobile_app
flutter pub get          # install dependencies
flutter run              # choose a device/emulator when prompted
flutter run -d chrome    # run the web build (path URL strategy is enabled in main.dart)
```

| Command                                           | What it does                                                  |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `flutter analyze`                                 | Static analysis with `flutter_lints`: reports 11 issues today (see Current status) |
| `flutter test`                                    | Runs `test/widget_test.dart` — currently fails, see below        |
| `dart format lib`                                 | Format the Dart sources (no formatter config is committed)       |
| `flutter build apk --debug` / `flutter build web` | Build for a device or for the web                                |

Verified with Flutter 3.44.6 / Dart 3.12.x on Windows.

## Supabase configuration

`lib/main.dart` creates the client with the project URL and the **publishable** key hard-coded in the
source:

```dart
await Supabase.initialize(url: '…', publishableKey: '…');
```

- The publishable/anon key is meant to be public: RLS policies — not the key — decide what a session may
  read or write. Never ship a service-role key in the app.
- Because it is hard-coded, the key sits in Git history and cannot vary per environment. Prefer
  `--dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…` read through `String.fromEnvironment`
  once the app really talks to the backend.
- No screen queries Supabase yet (no `auth.signIn`, no `.from(...)`), so the prototype renders fine with
  placeholder data even when the backend is unreachable.

## Design language

- Primary blue `#3860F4` for headers and the selected tab, page background `#F5F6F8`, white cards with
  `BorderRadius.circular(12–16)` and a soft `Colors.blueAccent` outline.
- The main action uses the gradient `#6B11FF → #B524FF → #00E5FF`; category icons use orange `#FF9800`,
  green `#4CAF50` and purple `#9C27B0`.
- Screens are `Scaffold` + `SingleChildScrollView` with a coloured header block; compose them from the
  widgets in `lib/widgets/` instead of copying layout code.
- Copy mixes Vietnamese labels with English strings left over from the mock-ups ("Welcome Human
  Resources!", "Login", "Email address", "Remember me"). Use Vietnamese for anything user-facing, and
  match the comment style of the file you are editing (this codebase comments in Vietnamese).

## Current status and limitations

- **Static mock UI everywhere.** Employee name, role, shift, salary and notices are literal strings
  ("Họ tên nhân viên", "Chức vụ nhân viên", "Lương: số tiền"); nothing is loaded from Supabase.
- **Login does nothing.** The arrow `FloatingActionButton` and "Forgot password?" have empty `onPressed`
  handlers, and the "Remember me" checkbox only flips local state.
- **Only one route is reachable:** the "Lịch làm việc" tile calls
  `Navigator.pushNamed(context, AppRoutes.work_schedule_employee)`. Every other tile, quick action and
  category card has an empty callback, and the bottom bar only updates `_selectedIndex` — no tab screens.
- **The four bottom tabs are visual only** (Trang chủ, Bản tin, Tin nhắn, Tài khoản); only Home exists.
- `DropdownFilterEmployee` draws a chevron but has no menu attached and is not used by any screen yet.
- `test/widget_test.dart` is still the generated counter test, so `flutter test` **fails** (it pumps
  `MyApp` and expects a counter UI). Replace it with a real widget test or remove it.
- **`flutter analyze` reports 11 issues (not blocking):** `flutter_web_plugins` is imported by
  `main.dart` but is not declared in `pubspec.yaml`; seven `withOpacity` calls are deprecated in favour of
  `withValues()`; `login_screen.dart` has one unnecessary `!`; and the route constants
  `home_employee` / `work_schedule_employee` are not lowerCamelCase.
- Placeholder metadata remains: `pubspec.yaml` description "A new Flutter project.", `web/index.html`
  title `hr_mobile_app`, Android package `com.example.hr_mobile_app`.
- No CI, no Docker, and no test suite beyond that single file.

## Working on this app

- **Register every new screen in `lib/routes/app_routers.dart`** (add a `static const String` plus a
  `WidgetBuilder` entry) and navigate with `Navigator.pushNamed` — that is how the existing
  Home → Work schedule link works.
- The screens currently live in `lib/models/` even though they are widgets. When adding one, either keep
  the existing convention (`<name>_screen.dart` inside `lib/models/`) or move them all to a properly named
  folder in one deliberate commit — do not leave both layouts mixed.
- Reuse the widgets in `lib/widgets/` (`BottomNavBar`, `StatCardEmployee`, `WorkScheduleItemCard`,
  `DropdownFilterEmployee`). New widgets belong there too, with constructors that receive the strings and
  colours they need instead of hard-coding copy.
- State is plain `setState`; no bloc/provider package is installed, so introducing one is a dependency
  change to agree on first.
- Assets must be declared in `pubspec.yaml` (`assets/images/` is already listed); the only image is
  `assets/images/bg.png`, used as both the login hero and the avatar placeholder.
- Run `dart format lib` and `flutter analyze` before committing; clearing the 11 findings listed above is
  a small, worthwhile follow-up.
- Branches `feat/…`, `fix/…`, `chore/…`, conventional commits scoped to the app (`feat(mobile): …`), one
  logical change per commit. Work inside `hr_mobile_app/` and keep changes from the sibling apps out of
  the same commit.

## Related documentation

| Where                         | Content                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `../README.md`                | Repository overview: all three apps and how to run each one                                        |
| `../hr_website/README.md`     | The manager admin app: API endpoints, Supabase schema, environment variables                       |
| `../hr_website/supabase/sql/*.sql` | The authoritative database schema the mobile app must respect once it queries Supabase        |
| `../landing_website/README.md`| The marketing site built for the same product                                                      |

## Tổng quan nhanh (Tiếng Việt)

- **Đây là gì:** ứng dụng Flutter dành cho nhân viên của hệ thống "Quản lý Nhân sự và Chấm công" (đồ án
  HUFLIT) — đăng nhập, xem lịch làm việc, và sau này là chấm công bằng khuôn mặt + GPS/WiFi, xem phiếu
  lương, nhận thông báo. Hai phần còn lại của hệ thống nằm ở `../hr_website` và `../landing_website`.
- **Hiện trạng:** còn là giao diện mẫu — tên nhân viên, chức vụ, lương, ca làm đều là chuỗi cứng; nút đăng
  nhập chưa xử lý; chỉ có một liên kết điều hướng hoạt động (Trang chủ → Lịch làm việc). Chi tiết ở mục
  "Current status and limitations".
- **Công nghệ:** Flutter 3.44.x, Dart `^3.12.2`, `supabase_flutter` (đã khởi tạo nhưng chưa truy vấn dữ
  liệu), quản lý trạng thái bằng `setState`.
- **Chạy dự án:** `cd hr_mobile_app`, `flutter pub get`, `flutter run` (hoặc `flutter run -d chrome` cho bản
  web); kiểm tra tĩnh bằng `flutter analyze`.
- **Lưu ý:** khóa Supabase (publishable key) đang viết cứng trong `lib/main.dart`, nên chuyển sang
  `--dart-define`; `flutter test` hiện lỗi vì còn test mặc định của Flutter; các thư mục `core/`, `data/`,
  `domain/`, `presentation/` vẫn trống (mới là ý định tách lớp).
