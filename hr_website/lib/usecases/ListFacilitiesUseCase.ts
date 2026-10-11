import type { Facility } from "@/lib/domain/entities/Facility";
import type { IFacilityRepository } from "@/lib/domain/repositories/IFacilityRepository";

export type ListFacilitiesInput = {
  branchId?: string;
};

export class ListFacilitiesUseCase {
  constructor(private readonly facilityRepository: IFacilityRepository) {}

  async execute(input: ListFacilitiesInput = {}): Promise<Facility[]> {
    return this.facilityRepository.findAll(input.branchId);
  }
}
