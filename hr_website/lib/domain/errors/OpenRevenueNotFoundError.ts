export class OpenRevenueNotFoundError extends Error {
  constructor() {
    super("No opening revenue declaration exists for this branch today.");
    this.name = "OpenRevenueNotFoundError";
  }
}
