import type {
  CreateDemoPaySalaryInput,
  DemoPaySalary,
  DemoPaySalaryFilters,
  DemoPaySummary,
  UpdateDemoPaySalaryInput,
} from "@/lib/domain/entities/DemoPaySalary";

/**
 * Lương thử việc theo vị trí (SCRUM-100) — một aggregate riêng, không phải thêm method vào
 * `IPayrollRepository`: nó không dùng `attendance`, `pay_profiles` hay `payslips`, và trộn hai vòng đời vào
 * một interface chỉ làm người đọc tưởng rằng một dòng demo có thể được phát hành như một phiếu lương.
 *
 * Hai quy tắc của phân hệ lương vẫn giữ nguyên ở đây:
 *
 * - **CSDL quyết định ai được làm gì.** Mọi hàm ghi đều mở đầu bằng `payroll_require_owner()` và đọc tổ chức
 *   từ phiên, nên không method nào nhận `organization_id`.
 * - **Tiền không được tính ở TypeScript.** `gross_amount`/`net_amount` là cột có CHECK do SQL tính; interface
 *   này chỉ đọc chúng, không có method nào nhận một con số tổng.
 */
export interface IDemoPaySalaryRepository {
  /** Mọi dòng lương thử việc của tổ chức, mới nhất trước; RLS chỉ cho chủ sở hữu đọc. */
  findAll(filters: DemoPaySalaryFilters): Promise<DemoPaySalary[]>;
  /** Thêm một dòng và trả về id của nó. */
  create(input: CreateDemoPaySalaryInput): Promise<string>;
  /** Sửa một dòng đã lưu (mọi trường, kể cả ngày hiệu lực) và trả về id; `404` khi dòng đã mất. */
  update(input: UpdateDemoPaySalaryInput): Promise<string>;
  /** Ngừng theo dõi nhưng giữ lịch sử (`status = 'ARCHIVED'`). */
  archive(id: string): Promise<void>;
  /** Xoá hẳn; dòng bị xoá được chép vào `payroll_audit_log` trước. */
  remove(id: string): Promise<void>;
  /** Số liệu theo dõi: số dòng theo trạng thái và tổng gross/net của các dòng đang hiệu lực. */
  summary(): Promise<DemoPaySummary>;
}
