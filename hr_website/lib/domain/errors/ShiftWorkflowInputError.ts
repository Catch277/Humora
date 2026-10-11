export class ShiftWorkflowInputError extends Error {
  constructor(message = "The shift request is invalid.") {
    super(message);
    this.name = "ShiftWorkflowInputError";
  }
}
