export class RevenueAlreadyDeclaredError extends Error {
  constructor() {
    super("Hôm nay chi nhánh này đã khai báo mở ca rồi.");
    this.name = "RevenueAlreadyDeclaredError";
  }
}
