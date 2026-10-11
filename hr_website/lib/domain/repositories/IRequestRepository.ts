import type {
  CreateRequestInput,
  RequestEntity,
  RequestFilters,
  ReviewRequestInput,
} from "@/lib/domain/entities/RequestEntity";

export interface IRequestRepository {
  findFiltered(filters: RequestFilters): Promise<RequestEntity[]>;
  /** One request as the caller may see it; the review rule needs its `branch_id` (SCRUM-61). */
  findById(id: string): Promise<RequestEntity | null>;
  /**
   * Files the caller's own request (SCRUM-41) as `PENDING`. `userId` always comes from the session:
   * `requests_insert_own` refuses any other `user_id`, so a request is never filed for somebody else.
   */
  create(input: CreateRequestInput & { userId: string }): Promise<RequestEntity>;
  review(id: string, input: ReviewRequestInput): Promise<RequestEntity>;
}
