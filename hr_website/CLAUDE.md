@AGENTS.md

# Kiến trúc dự án: Clean Architecture

- Framework: Next.js (App Router ở gốc `app/`), TypeScript.
- Backend & DB: Supabase (PostgreSQL).
- Cấu trúc thư mục logic (đặt trong thư mục `lib/` ở gốc):
  - `lib/domain/`: Chứa Entities (kiểu dữ liệu) và Interfaces. Không chứa logic framework.
  - `lib/usecases/`: Chứa business logic. Chỉ gọi qua Interfaces.
  - `lib/infrastructure/`: Triển khai Interfaces (gọi Supabase SDK tại đây).
- API Routes: Đặt tại `app/api/.../route.ts`. Gọi các UseCases từ đây, không gọi DB trực tiếp.
- Document: Bắt buộc viết JSDoc `@swagger` trên đầu mỗi file route API.
