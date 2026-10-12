export class BranchNotFoundError extends Error {
  constructor() {
    super("Không tìm thấy chi nhánh.");
    this.name = "BranchNotFoundError";
  }
}
