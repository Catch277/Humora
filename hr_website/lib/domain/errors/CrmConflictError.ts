/**
 * `409`: a business state conflict — a duplicate company, contract number or pasted message, a customer or
 * contract that still has data, or an action a terminated contract forbids.
 */
export class CrmConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmConflictError";
  }
}
