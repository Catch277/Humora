export class RevenueAlreadyDeclaredError extends Error {
  constructor() {
    super("Opening revenue has already been declared for this branch today.");
    this.name = "RevenueAlreadyDeclaredError";
  }
}
