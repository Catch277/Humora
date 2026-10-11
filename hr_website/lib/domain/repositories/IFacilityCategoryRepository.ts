import type {
  CreateFacilityCategoryInput,
  FacilityCategory,
} from "@/lib/domain/entities/Facility";

/**
 * The organization's "Nhóm thiết bị" catalogue (SCRUM-65): a table rather than the six-value enum
 * SCRUM-45 shipped, so the facilities tab can add a group of its own.
 *
 * RLS scopes both methods to the caller's organization (`facility_categories_select_authenticated` /
 * `facility_categories_insert_managers`), and `organization_id` is filled by its column default — the
 * repository never names a tenant.
 */
export interface IFacilityCategoryRepository {
  /** Every category of the organization, sorted by name. */
  findAll(): Promise<FacilityCategory[]>;
  create(input: CreateFacilityCategoryInput): Promise<FacilityCategory>;
}
