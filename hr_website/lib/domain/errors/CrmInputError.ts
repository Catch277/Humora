/** `400`: a value the CRM route parser could not accept, named in the sentence. */
export class CrmInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmInputError";
  }
}
