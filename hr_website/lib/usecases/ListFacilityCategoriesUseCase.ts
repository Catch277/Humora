import type { FacilityCategory } from "@/lib/domain/entities/Facility";
import type { IFacilityCategoryRepository } from "@/lib/domain/repositories/IFacilityCategoryRepository";

/** The "Nhóm thiết bị" options of the facilities screen, in one place (SCRUM-65). */
export class ListFacilityCategoriesUseCase {
  constructor(
    private readonly facilityCategoryRepository: IFacilityCategoryRepository,
  ) {}

  async execute(): Promise<FacilityCategory[]> {
    return this.facilityCategoryRepository.findAll();
  }
}
