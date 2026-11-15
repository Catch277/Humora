import type {
  CreateMaintenanceVisitInput,
  MaintenanceVisit,
} from "@/lib/domain/entities/MaintenanceVisit";
import { CrmInputError } from "@/lib/domain/errors/CrmInputError";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";
import { assertVisitInput, trimOrNull } from "@/lib/usecases/crmValidation";

/**
 * Đặt một lần bảo trì / sửa chữa (SCRUM-102, C5).
 *
 * The customer is taken from the **service**, not from the browser: a visit filed under the wrong customer
 * would appear on somebody else's row and disappear from the service's own history. The database's foreign
 * keys would refuse an unknown service anyway; this turns that into a sentence and a `404`.
 *
 * A visit created as already finished must say what was done — the CHECK enforces it, and this layer states
 * it before the insert so the dialog can point at the field.
 */
export class CreateMaintenanceVisitUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(input: CreateMaintenanceVisitInput): Promise<MaintenanceVisit> {
    assertVisitInput(input);

    const service = await this.repository.findById(input.serviceId);

    if (!service) {
      throw new CrmNotFoundError(
        "Không tìm thấy dịch vụ cần bảo trì trong tổ chức của bạn.",
      );
    }

    if (service.customer_id !== input.customerId) {
      throw new CrmInputError(
        "customerId không khớp với khách hàng của dịch vụ đã chọn.",
      );
    }

    return this.repository.createVisit({
      ...input,
      customerId: service.customer_id,
      technician: trimOrNull(input.technician),
      summary: trimOrNull(input.summary),
    });
  }
}
