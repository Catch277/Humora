/**
 * Lương thử việc (demo) của một **vị trí**, không phải của một nhân viên (SCRUM-100).
 *
 * Vì sao là bảng riêng chứ không phải một cờ trên `pay_profiles`/`payslips`: một dòng lương demo không được
 * phép lọt vào KPI lương thật, vào `my_pay_estimate()` của app mobile hay vào `publish_payslips`. Nếu nó nằm
 * cùng bảng với tiền thật thì mọi truy vấn và mọi policy hiện có đều phải nhớ thêm `is_demo = false`, và chỉ
 * cần quên một chỗ là con số demo trở thành một khoản đã trả.
 *
 * Bảng này **không** đi vào `attendance`, `pay_profiles`, `payslips` hay thông báo — nó là một bản mô phỏng
 * ("vị trí Giám đốc được trả bao nhiêu với mức này"), và màn hình `/payroll` nói rõ điều đó bằng nhãn DEMO.
 *
 * Tiền vẫn do SQL tính: `gross_amount` và `net_amount` là cột có CHECK ràng buộc với chính các thành phần
 * của chúng (`gross = monthly_hours × hourly_rate + allowance + bonus`, `net = gross − deduction`), nên
 * TypeScript không bao giờ nhân giờ với đơn giá.
 */
export const DEMO_PAY_SALARY_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export type DemoPaySalaryStatus = (typeof DEMO_PAY_SALARY_STATUSES)[number];

export interface DemoPaySalary {
  id: string;
  organization_id: string;
  position_code: string;
  position_title: string;
  monthly_hours: number;
  hourly_rate: number;
  allowance_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  gross_amount: number;
  net_amount: number;
  effective_from: string;
  status: DemoPaySalaryStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Biên của từng cột, mirror đúng các CHECK của `supabase/sql/SCRUM-100_demo_pay_salaries.sql` — một thân yêu
 * cầu mà API nhận thì không thể bị CHECK từ chối rồi trả `500`.
 */
export const DEMO_PAY_LIMITS = {
  monthlyHours: { min: 0, max: 744 },
  hourlyRate: { min: 0, max: 10_000_000 },
  amount: { min: 0, max: 1_000_000_000 },
  noteLength: 500,
  positionCodeLength: { min: 2, max: 40 },
  positionTitleLength: { min: 2, max: 80 },
} as const;

/** What the owner submits. `positionTitle` is stored and displayed verbatim, like `requests.request_type`. */
export interface CreateDemoPaySalaryInput {
  positionCode: string;
  positionTitle: string;
  monthlyHours: number;
  hourlyRate: number;
  allowanceAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  effectiveFrom: string;
  note: string | null;
  /**
   * Optional, and omitted means "the database default" on create / "keep the stored value" on update — the
   * same contract `PATCH /api/users/{id}` uses for `branch_id`. A screen that never sends it therefore cannot
   * silently un-archive a row it did not mean to touch.
   */
  status?: DemoPaySalaryStatus;
}

/**
 * Sửa một dòng đã lưu. `id` mới là thứ định danh dòng, và **mọi** trường sửa được — kể cả `effectiveFrom`
 * (một dòng lỡ lưu sai ngày hiệu lực) và `positionCode` (một dòng bị gán nhầm vị trí). Xoá rồi tạo lại là
 * cách duy nhất để đổi chủ sở hữu của dòng lương ở phân hệ thật (`pay_profiles`), ở đây thì không cần: một
 * bản mô phỏng theo vị trí không có lịch sử trả lương phía sau.
 */
export interface UpdateDemoPaySalaryInput extends CreateDemoPaySalaryInput {
  id: string;
}

export interface DemoPaySalaryFilters {
  positionCode?: string;
  status?: DemoPaySalaryStatus;
}

/** Một vị trí trong phần "theo dõi" của màn hình. */
export interface DemoPaySummaryPosition {
  position_code: string;
  position_title: string;
  records: number;
  gross_total: number;
  net_total: number;
}

/**
 * Tổng hợp để theo dõi (SCRUM-100). `gross_total` / `net_total` chỉ cộng những dòng `ACTIVE`: một dòng đã
 * ngừng theo dõi không được làm con số trên KPI thay đổi.
 */
export interface DemoPaySummary {
  active_records: number;
  archived_records: number;
  gross_total: number;
  net_total: number;
  positions: DemoPaySummaryPosition[];
}

export function isDemoPaySalaryStatus(
  value: unknown,
): value is DemoPaySalaryStatus {
  return (
    typeof value === "string" &&
    (DEMO_PAY_SALARY_STATUSES as readonly string[]).includes(value)
  );
}
