import type { ICustomerRepository } from "@/lib/domain/repositories/ICustomerRepository";

/**
 * Xoá một khách hàng (SCRUM-101).
 *
 * A customer that still has a contract is refused by the `customers_guard_delete` trigger and surfaces as a
 * `409` explaining "chuyển sang Đã rời" — deleting the row would take the contract history with it. The use
 * case therefore has nothing to decide; it exists so the route keeps one use case per action.
 */
export class DeleteCustomerUseCase {
  constructor(private readonly repository: ICustomerRepository) {}

  async execute(id: string): Promise<void> {
    await this.repository.remove(id);
  }
}
