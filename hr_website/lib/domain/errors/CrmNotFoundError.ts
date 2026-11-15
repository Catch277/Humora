/** `404`: the row is not there, or RLS hides it (an id from another organization answers the same way). */
export class CrmNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmNotFoundError";
  }
}
