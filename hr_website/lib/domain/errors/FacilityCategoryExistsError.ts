/**
 * A category with that name already exists in the organization (SCRUM-65) — the screen answers `409`
 * instead of letting the database's `(organization_id, name)` unique index surface as a `500`.
 */
export class FacilityCategoryExistsError extends Error {
  constructor() {
    super("A facility category with this name already exists.");
    this.name = "FacilityCategoryExistsError";
  }
}
