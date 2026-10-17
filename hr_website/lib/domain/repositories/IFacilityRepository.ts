import type {
  Facility,
  FacilityRecordInput,
} from "@/lib/domain/entities/Facility";

export interface IFacilityRepository {
  findAll(branchId?: string): Promise<Facility[]>;
  /** One facility as the caller may see it; the write rules need its `branch_id` (SCRUM-61). */
  findById(id: string): Promise<Facility | null>;
  /**
   * Every asset code already in use inside the caller's organization (SCRUM-66), so the next code can
   * carry the next free number. RLS scopes the read exactly like `findAll`; `null` codes are left out.
   */
  listCodes(): Promise<string[]>;
  /** `code` is the tag the use case generated (SCRUM-67) — it never comes from a request body. */
  create(input: FacilityRecordInput): Promise<Facility>;
  update(id: string, input: FacilityRecordInput): Promise<Facility>;
  delete(id: string): Promise<void>;
}
