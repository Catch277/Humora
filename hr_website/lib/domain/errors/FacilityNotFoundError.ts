export class FacilityNotFoundError extends Error {
  constructor() {
    super("Facility not found.");
    this.name = "FacilityNotFoundError";
  }
}
