import type { UpdateDemoPaySalaryInput } from "@/lib/domain/entities/DemoPaySalary";
import { PayrollInputError } from "@/lib/domain/errors/PayrollInputError";
import { isDemoSalaryPositionCode } from "@/lib/domain/demoSalaryPositions";
import { PAYROLL_TOKENS, payrollErrorMessage } from "@/lib/domain/payrollMessages";
import type { IDemoPaySalaryRepository } from "@/lib/domain/repositories/IDemoPaySalaryRepository";

/**
 * Sửa một mức lương thử việc đã lưu (SCRUM-100).
 *
 * Cùng một quy tắc với lúc thêm — vị trí phải thuộc danh sách app biết — vì `position_code` sửa được ở đây:
 * một dòng bị gán nhầm vị trí là chuyện có thật, và "xoá rồi tạo lại" không phải câu trả lời trong một bản
 * mô phỏng không có lịch sử trả lương phía sau.
 */
export class UpdateDemoPaySalaryUseCase {
  constructor(private readonly repository: IDemoPaySalaryRepository) {}

  async execute(input: UpdateDemoPaySalaryInput): Promise<string> {
    if (!isDemoSalaryPositionCode(input.positionCode)) {
      throw new PayrollInputError(
        payrollErrorMessage(PAYROLL_TOKENS.demoPositionRequired),
      );
    }

    return this.repository.update(input);
  }
}
