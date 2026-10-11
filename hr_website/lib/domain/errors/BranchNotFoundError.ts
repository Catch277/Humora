export class BranchNotFoundError extends Error {
  constructor() {
    super("Branch not found.");
    this.name = "BranchNotFoundError";
  }
}
