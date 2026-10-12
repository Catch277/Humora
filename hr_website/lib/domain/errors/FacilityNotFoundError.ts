export class FacilityNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy thiết bị.");
    this.name = "FacilityNotFoundError";
  }
}
