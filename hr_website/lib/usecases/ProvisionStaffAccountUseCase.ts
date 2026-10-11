import type { StaffProvisionResult } from "@/lib/domain/entities/StaffProvisionResult";
import { INVITE_ROLES } from "@/lib/domain/entities/OrganizationInvite";
import { StaffProvisioningForbiddenError } from "@/lib/domain/errors/StaffProvisioningForbiddenError";
import type { IStaffProvisioningService } from "@/lib/domain/repositories/IStaffProvisioningService";
import { isOwnerRole } from "@/lib/domain/roles";
import {
  emailValidationError,
  newPasswordValidationError,
} from "@/lib/usecases/credentials";

const ROLE_SET: ReadonlySet<string> = new Set(INVITE_ROLES);
const MAX_NAME_LENGTH = 120;

export type ProvisionStaffAccountInput = {
  callerToken: string;
  callerRole: string;
  email: string;
  fullName: string | null;
  role: string;
  password: string;
};

/**
 * Creates a real Supabase Auth account for a colleague (SCRUM-52). The temporary password goes to
 * the Edge Function and nowhere else — it is neither stored nor logged — and the account it makes
 * must change that password on first sign-in before the rest of the app opens.
 *
 * The same checks run again inside the function; this copy exists so the screen gets a `400` naming
 * the field instead of a remote `422`.
 */
export class ProvisionStaffAccountUseCase {
  constructor(
    private readonly staffProvisioningService: IStaffProvisioningService,
  ) {}

  async execute(input: ProvisionStaffAccountInput): Promise<StaffProvisionResult> {
    if (!isOwnerRole(input.callerRole)) {
      throw new StaffProvisioningForbiddenError();
    }

    const email = input.email.trim();
    const fullName = input.fullName?.trim() ?? "";

    const validationError =
      emailValidationError(email) ??
      newPasswordValidationError(input.password) ??
      (fullName.length > MAX_NAME_LENGTH
        ? `full_name must be at most ${MAX_NAME_LENGTH} characters.`
        : null);

    if (validationError) {
      throw new Error(validationError);
    }

    if (!ROLE_SET.has(input.role)) {
      throw new Error(`role must be one of ${INVITE_ROLES.join(", ")}.`);
    }

    return this.staffProvisioningService.createAccount({
      callerToken: input.callerToken,
      email,
      fullName,
      role: input.role as "EMPLOYEE" | "MANAGER",
      password: input.password,
    });
  }
}