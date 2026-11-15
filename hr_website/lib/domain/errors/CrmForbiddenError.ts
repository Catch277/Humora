/** `403`: the caller's role holds no CRM capability (owner-only, SCRUM-101/102). */
export class CrmForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmForbiddenError";
  }
}
