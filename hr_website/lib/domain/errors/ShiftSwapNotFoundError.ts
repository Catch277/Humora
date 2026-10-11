export class ShiftSwapNotFoundError extends Error {
  constructor(message = "Shift swap not found.") {
    super(message);
    this.name = "ShiftSwapNotFoundError";
  }
}
