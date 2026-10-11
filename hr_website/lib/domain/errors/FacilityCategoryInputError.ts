/** The name typed for a new facility category (SCRUM-65) is empty or too long — a `400`, not a `500`. */
export class FacilityCategoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacilityCategoryInputError";
  }
}
