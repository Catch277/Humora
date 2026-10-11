/**
 * The account is not on the organization's register. This is the second factor of the join (the
 * first is the correct code), so somebody who obtains the code still cannot enter.
 */
export class NotInvitedError extends Error {
  constructor() {
    super(
      "This account has not been registered by that organization. Ask the owner to create the account or send an invite.",
    );
    this.name = "NotInvitedError";
  }
}