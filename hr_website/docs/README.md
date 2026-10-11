# Kho tài liệu cho Trợ lý AI

Bỏ file `.md` / `.txt` của bạn vào thư mục này, chạy script nhúng, rồi trợ lý AI ở `/chat` sẽ có dữ
liệu để trả lời (thay vì luôn trả lời "Tôi không có thông tin về vấn đề này…").

## Cách dùng

```bash
# 1. Nhúng tài liệu trong docs/ → sinh file supabase/sql/knowledge_seed.sql
npx tsx scripts/ingest-knowledge.ts

# 2. Mở Supabase Dashboard → SQL Editor, dán nội dung file vừa sinh rồi bấm Run

# 3. Mở /chat và xem panel "Nguồn tri thức" ở cột trái
```

Script cần `GEMINI_API_KEY` (tự đọc từ `.env.local`) và cần mạng để gọi Gemini tạo embedding.

## Quy ước

- **Tiêu đề tài liệu = heading `#` đầu tiên trong file.** Đây chính là tên hiện trong phần "Trích dẫn
  tài liệu" của câu trả lời, nên hãy đặt tên đọc lên là hiểu, ví dụ `# Sổ tay Nhân sự Humora`.
  Không có heading thì lấy tên file.
- **Mỗi file là một tài liệu.** Hai file cùng tiêu đề sẽ gộp thành một tài liệu trong bảng kê.
- **Cắt đoạn:** mỗi đoạn ≤ 1000 ký tự (đổi bằng `--max-chars`), ranh giới là dòng trống để không cắt
  giữa câu; đoạn ngắn hơn 40 ký tự bị bỏ vì chỉ là tiêu đề mục.
- **`README.md` ngay trong thư mục nguồn bị bỏ qua** (file trong thư mục con vẫn được nhúng).
- **Chạy lại là an toàn:** file SQL sinh ra xoá đúng các `title` có trong thư mục nguồn rồi chèn lại,
  nên sửa tài liệu rồi chạy lại sẽ cập nhật chứ không nhân bản dữ liệu.

## Hợp đồng lao động (riêng từng người)

`company_documents` là tài liệu dùng chung cho cả công ty. Hợp đồng cá nhân nằm ở bảng khác và phải
gắn với một nhân viên:

```bash
npx tsx scripts/ingest-knowledge.ts --table user_contracts --user-id <uuid nhân viên> --source docs/contracts
```

## Lưu ý

- Vector là **768 chiều** (`gemini-embedding-001`), phải khớp cột `embedding` của database. Kiểm tra
  bằng: `select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.company_documents'::regclass and attname = 'embedding';`
- File `supabase/sql/knowledge_seed.sql` là file sinh tự động, **không commit** (đã nằm trong
  `.gitignore`) vì chứa toàn bộ nội dung tài liệu kèm vector.
- Những gì bạn đặt ở đây là những gì trợ lý sẽ trích dẫn: không đưa dữ liệu lương hay thông tin cá
  nhân vào `company_documents`. Hợp đồng cá nhân đi vào `user_contracts` để RLS giữ riêng cho từng người.
