import type {
  CreateFacilityCategoryInput,
  FacilityCategory,
} from "@/lib/domain/entities/Facility";
import { FacilityCategoryExistsError } from "@/lib/domain/errors/FacilityCategoryExistsError";
import type { IFacilityCategoryRepository } from "@/lib/domain/repositories/IFacilityCategoryRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const CATEGORY_COLUMNS = "id, organization_id, code, name, created_at";

/**
 * Row shape as PostgREST returns it. Declared locally because the client has no generated Database type;
 * the columns are `uuid`/`text`/`timestamptz`, so nothing has to be coerced.
 */
type FacilityCategoryRow = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  created_at: string;
};

function toFacilityCategory(row: FacilityCategoryRow): FacilityCategory {
  return {
    id: row.id,
    organization_id: row.organization_id,
    code: row.code,
    name: row.name,
    created_at: row.created_at,
  };
}

export class SupabaseFacilityCategoryRepository
  implements IFacilityCategoryRepository
{
  async findAll(): Promise<FacilityCategory[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("facility_categories")
      .select(CATEGORY_COLUMNS)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Unable to load the facility categories: ${error.message}`);
    }

    return ((data ?? []) as FacilityCategoryRow[]).map(toFacilityCategory);
  }

  async create(input: CreateFacilityCategoryInput): Promise<FacilityCategory> {
    const supabase = await createSupabaseServerClient();
    // `organization_id` is left out on purpose: its column default is `current_organization_id()` and the
    // insert policy checks the same value, so the tenant always comes from the session.
    const { data, error } = await supabase
      .from("facility_categories")
      .insert({ code: input.code, name: input.name })
      .select(CATEGORY_COLUMNS)
      .single();

    if (error) {
      // 23505: the (organization_id, code|name) unique index. The use case checks first, so this is a race
      // between two operators saving the same name.
      if (error.code === "23505") {
        throw new FacilityCategoryExistsError();
      }

      throw new Error(`Unable to create the facility category: ${error.message}`);
    }

    return toFacilityCategory(data as FacilityCategoryRow);
  }
}
