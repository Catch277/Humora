export class StaffForbiddenError extends Error {
  constructor() {
    super(
      "Only the organization's OWNER may manage staff accounts, and only an OWNER may grant or revoke the OWNER role.",
    );
    this.name = "StaffForbiddenError";
  }
}