/**
 * The external geocoder did not answer (offline, timed out, rate-limited or answering with an
 * error). The branch form keeps the coordinates it already has and asks the operator to type the
 * address, so this is a `503` — a temporary third-party outage, not a mistake in the request.
 */
export class ReverseGeocodingUnavailableError extends Error {
  constructor() {
    super("The address lookup service is not available. Please type the address.");
    this.name = "ReverseGeocodingUnavailableError";
  }
}
