import type {
  InviteRole,
  OrganizationInvite,
} from "@/lib/domain/entities/OrganizationInvite";
import { OrganizationForbiddenError } from "@/lib/domain/errors/OrganizationForbiddenError";
import { OrganizationInviteExistsError } from "@/lib/domain/errors/OrganizationInviteExistsError";
import { OrganizationInviteNotFoundError } from "@/lib/domain/errors/OrganizationInviteNotFoundError";
import type { IOrganizationInviteRepository } from "@/lib/domain/repositories/IOrganizationInviteRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * A literal column list, not `.join(", ")`: the Supabase client infers the row type from the
 * string literal, and a computed string collapses it to `GenericStringError` (see AGENTS).
 */
const INVITE_COLUMNS =
  "id, organization_id, email, full_name, role, source, invited_by, claimed_by, claimed_at, created_at";

type InviteRow = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  role: string;
  source: string;
  invited_by: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
};

function toInvite(row: InviteRow): OrganizationInvite {
  return {
    id: row.id,
    organization_id: row.organization_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    source: row.source,
    invited_by: row.invited_by,
    claimed_by: row.claimed_by,
    claimed_at: row.claimed_at,
    created_at: row.created_at,
  };
}

export class SupabaseOrganizationInviteRepository
  implements IOrganizationInviteRepository
{
  async findAll(organizationId: string): Promise<OrganizationInvite[]> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("organization_invites")
      .select(INVITE_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to load the invites: ${error.message}`);
    }

    return ((data ?? []) as InviteRow[]).map(toInvite);
  }

  async countPending(organizationId: string): Promise<number> {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from("organization_invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("claimed_by", null);

    if (error) {
      throw new Error(`Unable to count the invites: ${error.message}`);
    }

    return count ?? 0;
  }

  async create(input: {
    organizationId: string;
    email: string;
    fullName: string | null;
    role: InviteRole;
    invitedBy: string;
  }): Promise<OrganizationInvite> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("organization_invites")
      .insert({
        organization_id: input.organizationId,
        // Stored lower-cased: the unique index and the join RPC both match on lower(email).
        email: input.email.trim().toLowerCase(),
        full_name: input.fullName,
        role: input.role,
        source: "invite",
        invited_by: input.invitedBy,
      })
      .select(INVITE_COLUMNS)
      .maybeSingle();

    if (error) {
      // 23505 = the unique index on (organization_id, lower(email)) already lists this address.
      if (error.code === "23505") {
        throw new OrganizationInviteExistsError();
      }

      throw new Error(`Unable to create the invite: ${error.message}`);
    }

    // The insert policy requires the organization's OWNER (SCRUM-59), so no row back means refused.
    if (!data) {
      throw new OrganizationForbiddenError();
    }

    return toInvite(data as InviteRow);
  }

  async revoke(id: string): Promise<void> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("organization_invites")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to revoke the invite: ${error.message}`);
    }

    // RLS hides other organizations' rows, so both cases are a plain "not found".
    if (!data) {
      throw new OrganizationInviteNotFoundError();
    }
  }
}