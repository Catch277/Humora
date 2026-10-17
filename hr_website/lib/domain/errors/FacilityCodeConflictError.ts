/**
 * The asset code already belongs to another facility of the organization (SCRUM-66) — raised by the
 * `facilities_organization_code_key` unique index, which the repository translates so the route can
 * answer `409` instead of a bare `500`.
 *
 * A generated code reaches this only through a race: two saves that counted the same highest number at
 * the same moment (SCRUM-67 made the tag uneditable, so a typed duplicate is no longer a way in). The
 * sentence therefore asks the operator to save again rather than to pick another code.
 */
export class FacilityCodeConflictError extends Error {
  constructor() {
    super(
      "Mã tài sản này đã được dùng cho một thiết bị khác trong tổ chức. Vui lòng lưu lại để hệ thống cấp số kế tiếp.",
    );
    this.name = "FacilityCodeConflictError";
  }
}
