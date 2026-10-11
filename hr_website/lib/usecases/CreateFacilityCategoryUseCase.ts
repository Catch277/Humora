import {
  MAX_FACILITY_CATEGORY_NAME_LENGTH,
  type FacilityCategory,
} from "@/lib/domain/entities/Facility";
import { FacilityCategoryExistsError } from "@/lib/domain/errors/FacilityCategoryExistsError";
import { FacilityCategoryInputError } from "@/lib/domain/errors/FacilityCategoryInputError";
import type { IFacilityCategoryRepository } from "@/lib/domain/repositories/IFacilityCategoryRepository";
import {
  facilityCategoryCode,
  uniqueFacilityCategoryCode,
} from "@/lib/usecases/facilityCategoryCode";

/** The name a route handler read from the body; there is nothing else to a new category. */
export type CreateFacilityCategoryUseCaseInput = {
  name: string;
};

/**
 * Adds one "Nhóm thiết bị" to the organization's catalogue (SCRUM-65), from the facilities tab.
 *
 * The `code` is derived here rather than typed by the operator: it is the value `facilities.category`
 * stores, so it has to satisfy both the database's CHECK and the `(organization_id, code)` unique index —
 * which is exactly what `facilityCategoryCode()` and `uniqueFacilityCategoryCode()` do. The catalogue has
 * to be read first for that, and a duplicate *name* is refused before the insert so the screen can answer
 * `409` with a sentence instead of translating a unique-index violation.
 */
export class CreateFacilityCategoryUseCase {
  constructor(
    private readonly facilityCategoryRepository: IFacilityCategoryRepository,
  ) {}

  async execute(
    input: CreateFacilityCategoryUseCaseInput,
  ): Promise<FacilityCategory> {
    const name = input.name.trim().replace(/\s+/g, " ");

    if (!name || name.length > MAX_FACILITY_CATEGORY_NAME_LENGTH) {
      throw new FacilityCategoryInputError(
        `name must be a non-empty string of at most ${MAX_FACILITY_CATEGORY_NAME_LENGTH} characters.`,
      );
    }

    const existing = await this.facilityCategoryRepository.findAll();
    const normalized = name.toLocaleLowerCase("vi");

    // Compared case- and accent-insensitively: "Vệ sinh" and "vệ sinh" are one category to an operator,
    // and the unique index on `(organization_id, name)` would refuse the second one anyway.
    if (
      existing.some(
        (category) => category.name.toLocaleLowerCase("vi") === normalized,
      )
    ) {
      throw new FacilityCategoryExistsError();
    }

    return this.facilityCategoryRepository.create({
      name,
      code: uniqueFacilityCategoryCode(facilityCategoryCode(name), existing),
    });
  }
}
