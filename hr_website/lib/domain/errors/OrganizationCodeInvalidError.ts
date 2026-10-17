/** Wrong (or rotated away) code. Deliberately not "no such organization": that would confirm a code. */
export class OrganizationCodeInvalidError extends Error {
  constructor() {
    super("Mã tham gia không đúng.");
    this.name = "OrganizationCodeInvalidError";
  }
}