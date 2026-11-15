import type { IDemoPaySalaryRepository } from "@/lib/domain/repositories/IDemoPaySalaryRepository";

/**
 * Xoá hẳn một mức lương thử việc (SCRUM-100).
 *
 * "Xoá" ở đây không đụng tới đồng tiền nào của phân hệ thật: bảng demo không có phiếu lương, không có ca, nên
 * không có bản ghi nào phải giữ lại như `pay_profiles` (nơi một dòng là lịch sử lương của một người). Dòng bị
 * xoá vẫn được `delete_demo_pay_salary` chép vào `payroll_audit_log` trước, để "ai đã xoá mức lương demo nào"
 * còn trả lời được. `404` khi id không thuộc tổ chức trong phiên — do SQL quyết định.
 */
export class DeleteDemoPaySalaryUseCase {
  constructor(private readonly repository: IDemoPaySalaryRepository) {}

  async execute(id: string): Promise<void> {
    return this.repository.remove(id);
  }
}
