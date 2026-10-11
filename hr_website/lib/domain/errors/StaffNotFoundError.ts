export class StaffNotFoundError extends Error {
  constructor() {
    super("Staff member not found.");
    this.name = "StaffNotFoundError";
  }
}