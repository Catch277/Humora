import type {
  MaintenanceVisit,
  UpdateMaintenanceVisitInput,
} from "@/lib/domain/entities/MaintenanceVisit";
import { CrmInputError } from "@/lib/domain/errors/CrmInputError";
import { CrmNotFoundError } from "@/lib/domain/errors/CrmNotFoundError";
import type { ICustomerServiceRepository } from "@/lib/domain/repositories/ICustomerServiceRepository";
import {
  isCalendarDate,
  trimOrNull,
} from "@/lib/usecases/crmValidation";

/**
 * Hoàn tất hoặc dời một lần bảo trì (SCRUM-102).
 *
 * `PATCH` keeps every omitted field, so the completion check has to be made against the **merged** row: a
 * caller sending only `completedOn` still needs the stored `summary`, and one sending only `summary` keeps
 * the stored `completedOn`. "Xong" with no sentence is refused here for the same reason the CHECK exists.
 */
export class UpdateMaintenanceVisitUseCase {
  constructor(private readonly repository: ICustomerServiceRepository) {}

  async execute(input: UpdateMaintenanceVisitInput): Promise<MaintenanceVisit> {
    if (input.scheduledOn !== undefined && !isCalendarDate(input.scheduledOn)) {
      throw new CrmInputError("scheduledOn phải là ngày hợp lệ (YYYY-MM-DD).");
    }

    if (
      input.completedOn !== undefined &&
      input.completedOn !== null &&
      !isCalendarDate(input.completedOn)
    ) {
      throw new CrmInputError("completedOn phải là ngày hợp lệ hoặc null.");
    }

    if (
      input.cost !== undefined &&
      (!Number.isFinite(input.cost) || input.cost < 0 || input.cost > 1_000_000_000)
    ) {
      throw new CrmInputError("cost phải nằm trong khoảng 0 đến 1.000.000.000.");
    }

    const stored = await this.repository.findVisitById(input.id);

    if (!stored) {
      throw new CrmNotFoundError(
        "Không tìm thấy lần bảo trì này trong tổ chức của bạn.",
      );
    }

    // `PATCH` keeps an omitted field, so "is this visit finished with a sentence?" is judged on the merged
    // row rather than on the payload alone.
    const completedOn =
      input.completedOn === undefined ? stored.completed_on : input.completedOn;
    const summary =
      input.summary === undefined ? stored.summary : trimOrNull(input.summary);

    if (completedOn !== null && (summary?.trim().length ?? 0) < 3) {
      throw new CrmInputError(
        "summary là bắt buộc (ít nhất 3 ký tự) khi lần bảo trì đã hoàn tất.",
      );
    }

    return this.repository.updateVisit({
      ...input,
      technician:
        input.technician === undefined ? undefined : trimOrNull(input.technician),
      summary:
        input.summary === undefined ? undefined : trimOrNull(input.summary),
    });
  }
}
