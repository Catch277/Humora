/**
 * A field the Edge Function rejected (`422`). Unlike the other domain errors this one carries the
 * message it was given: the wording is produced by the function's own validation, which mirrors
 * `lib/usecases/credentials.ts`, and replacing it would lose which field was wrong.
 */
export class StaffProvisioningInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffProvisioningInputError";
  }
}