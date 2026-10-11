import type { Organization } from "@/lib/domain/entities/Organization";
import { AlreadyInOrganizationError } from "@/lib/domain/errors/AlreadyInOrganizationError";
import { MissingUserProfileError } from "@/lib/domain/errors/MissingUserProfileError";
import { NotInvitedError } from "@/lib/domain/errors/NotInvitedError";
import { OrganizationCodeInvalidError } from "@/lib/domain/errors/OrganizationCodeInvalidError";
import { OrganizationForbiddenError } from "@/lib/domain/errors/OrganizationForbiddenError";
import { OrganizationNotFoundError } from "@/lib/domain/errors/OrganizationNotFoundError";
import { TooManyJoinAttemptsError } from "@/lib/domain/errors/TooManyJoinAttemptsError";
import type { IOrganizationRepository } from "@/lib/domain/repositories/IOrganizationRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

const ORGANIZATION_COLUMNS = "id, name, created_by, created_at, updated_at";

type RpcFailure = { message?: string };

/**
 * `create_organization`, `join_organization` and `regenerate_organization_code` are
 * `security definer` RPCs (SCRUM-51) and signal a refusal by raising a marker message, because the
 * caller must not be able to read what the decision needs (another organization's invites, its
 * own `users` row, the whole code table).
 */
function translate(error: RpcFailure): Error {
  const message = error.message ?? "";

  if (message.includes("ALREADY_IN_ORGANIZATION")) {
    return new AlreadyInOrganizationError();
  }

  if (message.includes("ACCOUNT_HAS_NO_PROFILE")) {
    return new MissingUserProfileError();
  }

  if (message.includes("INVALID_CODE")) {
    return new OrganizationCodeInvalidError();
  }

  if (message.includes("NOT_INVITED")) {
    return new NotInvitedError();
  }

  if (message.includes("TOO_MANY_ATTEMPTS")) {
    return new TooManyJoinAttemptsError();
  }

  if (message.includes("NOT_ORGANIZATION_OWNER")) {
    return new OrganizationForbiddenError();
  }

  if (message.includes("ORGANIZATION_NAME_INVALID")) {
    // Worded like the other field validations, so the route maps it to a 400 by its prefix.
    return new Error("name must be between 2 and 120 characters.");
  }

  return new Error(
    `Unable to change the organization: ${message || "unknown error"}`,
  );
}

export class SupabaseOrganizationRepository implements IOrganizationRepository {
  async findCurrent(): Promise<Organization | null> {
    const supabase = await createSupabaseServerClient();
    // RLS answers with the caller's organization only, so "no row" means "not in one yet".
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load the organization: ${error.message}`);
    }

    return data;
  }

  async findJoinCode(): Promise<string | null> {
    const supabase = await createSupabaseServerClient();
    // The policy gives this table to the organization's OWNER (SCRUM-59), so anybody else gets null.
    const { data, error } = await supabase
      .from("organization_join_codes")
      .select("code")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load the organization code: ${error.message}`);
    }

    return data?.code ?? null;
  }

  async countMembers(): Promise<number> {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true });

    if (error) {
      throw new Error(`Unable to count the members: ${error.message}`);
    }

    return count ?? 0;
  }

  async create(name: string): Promise<Organization> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_organization", {
      p_name: name,
    });

    if (error) {
      throw translate(error);
    }

    // A function returning a composite type arrives as a plain object.
    return data as unknown as Organization;
  }

  async join(code: string): Promise<Organization> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("join_organization", {
      p_code: code,
    });

    if (error) {
      throw translate(error);
    }

    return data as unknown as Organization;
  }

  async rename(organizationId: string, name: string): Promise<Organization> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("organizations")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", organizationId)
      .select(ORGANIZATION_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to rename the organization: ${error.message}`);
    }

    // The update policy requires the organization's OWNER, so a blocked update and a wrong id look the same.
    if (!data) {
      throw new OrganizationNotFoundError();
    }

    return data;
  }

  async rotateJoinCode(): Promise<string> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("regenerate_organization_code");

    if (error) {
      throw translate(error);
    }

    return typeof data === "string" ? data : "";
  }
}