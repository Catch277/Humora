/**
 * A category with that name already exists in the organization (SCRUM-65) — the screen answers `409`
 * instead of letting the database's `(organization_id, name)` unique index surface as a `500`.
 */
export class FacilityCategoryExistsError extends Error {
  constructor() {
    super("Nhóm thiết bị này đã tồn tại.");
    this.name = "FacilityCategoryExistsError";
  }
}
