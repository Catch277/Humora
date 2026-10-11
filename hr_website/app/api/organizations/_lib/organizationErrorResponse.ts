import { NextResponse } from "next/server";

import { AlreadyInOrganizationError } from "@/lib/domain/errors/AlreadyInOrganizationError";
import { MissingUserProfileError } from "@/lib/domain/errors/MissingUserProfileError";
import { NotInvitedError } from "@/lib/domain/errors/NotInvitedError";
import { OrganizationCodeInvalidError } from "@/lib/domain/errors/OrganizationCodeInvalidError";
import { OrganizationForbiddenError } from "@/lib/domain/errors/OrganizationForbiddenError";
import { OrganizationInviteExistsError } from "@/lib/domain/errors/OrganizationInviteExistsError";
import { OrganizationInviteNotFoundError } from "@/lib/domain/errors/OrganizationInviteNotFoundError";
import { OrganizationNotFoundError } from "@/lib/domain/errors/OrganizationNotFoundError";
import { StaffAccountEmailTakenError } from "@/lib/domain/errors/StaffAccountEmailTakenError";
import { StaffProvisioningForbiddenError } from "@/lib/domain/errors/StaffProvisioningForbiddenError";
import { StaffProvisioningInputError } from "@/lib/domain/errors/StaffProvisioningInputError";
import { StaffProvisioningRateLimitedError } from "@/lib/domain/errors/StaffProvisioningRateLimitedError";
import { StaffProvisioningUnavailableError } from "@/lib/domain/errors/StaffProvisioningUnavailableError";
import { TooManyJoinAttemptsError } from "@/lib/domain/errors/TooManyJoinAttemptsError";

/** Field-validation messages the organization use cases produce (`<field> must …`). */
const VALIDATION_PREFIXES = [
  "name must",
  "code must",
  "email must",
  "role must",
  "full_name must",
  "password must",
];

/**
 * Maps a caught organization error to the status the API contract promises, or `null` when it is
 * not an expected failure (the handler then logs it and answers a generic `500`).
 *
 * Shared through `_lib` because every handler of this resource maps the same small set of domain
 * errors; keeping the table in one place is also what makes it obvious that `403` is used for both
 * "your role may not do that" and "that code is wrong" — the second one deliberately, so a caller
 * cannot use the status code to probe whether a code exists.
 */
export function organizationErrorResponse(
  error: unknown,
  action: string,
): NextResponse | null {
  if (
    error instanceof OrganizationNotFoundError ||
    error instanceof OrganizationInviteNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (
    error instanceof OrganizationForbiddenError ||
    error instanceof MissingUserProfileError ||
    error instanceof NotInvitedError ||
    error instanceof OrganizationCodeInvalidError ||
    error instanceof StaffProvisioningForbiddenError
  ) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (
    error instanceof AlreadyInOrganizationError ||
    error instanceof OrganizationInviteExistsError ||
    error instanceof StaffAccountEmailTakenError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (
    error instanceof TooManyJoinAttemptsError ||
    error instanceof StaffProvisioningRateLimitedError
  ) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }

  if (error instanceof StaffProvisioningInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 503, not 500: nothing is broken in this app, a companion service is simply not deployed.
  if (error instanceof StaffProvisioningUnavailableError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (
    error instanceof Error &&
    VALIDATION_PREFIXES.some((prefix) => error.message.startsWith(prefix))
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(action, error);
  return null;
}