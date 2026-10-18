export class OpenRevenueNotFoundError extends Error {
  constructor() {
    super("Hôm nay chi nhánh này chưa khai báo mở ca.");
    this.name = "OpenRevenueNotFoundError";
  }
}
