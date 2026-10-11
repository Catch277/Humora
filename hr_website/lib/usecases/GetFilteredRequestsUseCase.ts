import type {
  RequestEntity,
  RequestFilters,
} from "@/lib/domain/entities/RequestEntity";
import type { IRequestRepository } from "@/lib/domain/repositories/IRequestRepository";

export class GetFilteredRequestsUseCase {
  constructor(private readonly requestRepository: IRequestRepository) {}

  async execute(filters: RequestFilters): Promise<RequestEntity[]> {
    return this.requestRepository.findFiltered(filters);
  }
}
