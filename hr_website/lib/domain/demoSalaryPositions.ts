import type { MessageKey, Translate } from "@/lib/i18n/translate";
import { translateVi } from "@/lib/i18n/translate";

/**
 * Vị trí mà một dòng lương thử việc có thể thuộc về (SCRUM-100).
 *
 * **Giám đốc là mục đầu tiên và là mặc định**, vì đó là chỗ duy nhất trong app mà một mức lương không có
 * đường vào: `set_pay_profile` từ chối `OWNER` làm nhân viên được trả lương và `generate_payslips` bỏ qua
 * `OWNER`, nên "Giám đốc được trả bao nhiêu" chỉ có thể là một bản mô phỏng.
 *
 * Danh sách này là **một bảng tra trong app, không phải một CHECK trong SQL** (bài học SCRUM-62): một mã lạ
 * phải render được, chứ không được làm câu ghi của một bản build cũ trả `500`. `position_title` được lưu và
 * hiển thị nguyên văn, y như `requests.request_type`.
 */
export const DEMO_SALARY_POSITIONS = [
  { code: "DIRECTOR", labelKey: "demoSalary.position.director" },
  { code: "MANAGER", labelKey: "demoSalary.position.manager" },
  { code: "SHIFT_LEAD", labelKey: "demoSalary.position.shiftLead" },
  { code: "BARISTA", labelKey: "demoSalary.position.barista" },
] as const;

export type DemoSalaryPositionCode =
  (typeof DEMO_SALARY_POSITIONS)[number]["code"];

/** Chỗ mà form thêm mới bắt đầu: vị trí Giám đốc. */
export const DEFAULT_DEMO_SALARY_POSITION: DemoSalaryPositionCode = "DIRECTOR";

const LABEL_KEYS: Record<DemoSalaryPositionCode, MessageKey> = {
  DIRECTOR: "demoSalary.position.director",
  MANAGER: "demoSalary.position.manager",
  SHIFT_LEAD: "demoSalary.position.shiftLead",
  BARISTA: "demoSalary.position.barista",
};

export function isDemoSalaryPositionCode(
  value: string,
): value is DemoSalaryPositionCode {
  return (DEMO_SALARY_POSITIONS as readonly { code: string }[]).some(
    (position) => position.code === value,
  );
}

/**
 * Nhãn của một mã vị trí. `t` là tham số **cuối, tuỳ chọn** và mặc định là `translateVi`, đúng quy ước của
 * `lib/i18n/labels.ts`: một màn hình đã migrate thì truyền `useLocale().t`, một helper gọi ngoài component
 * vẫn ra tiếng Việt, và một mã mà danh sách này không biết thì render chính nó thay vì một ô trống.
 */
export function demoSalaryPositionLabel(
  code: string,
  t: Translate = translateVi,
): string {
  return isDemoSalaryPositionCode(code) ? t(LABEL_KEYS[code]) : code;
}
