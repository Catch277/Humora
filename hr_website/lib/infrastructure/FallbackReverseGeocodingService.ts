import { ReverseGeocodingUnavailableError } from "@/lib/domain/errors/ReverseGeocodingUnavailableError";
import type { IReverseGeocodingService } from "@/lib/domain/repositories/IReverseGeocodingService";

/**
 * The address lookup with a plan B (SCRUM-64). The providers are tried in order and the first address
 * wins, which is what keeps the branch form usable when one of them cannot be reached: a filtered
 * network or a blackholed DNS answer for one provider (the operator's resolver mapping
 * `nominatim.openstreetmap.org` to `127.0.0.1` is a real case), a rate limit, or an outage.
 *
 * The rule, and the reason this is a service instead of an `if` in the route:
 *
 * - a provider that answers with an address ends the lookup;
 * - a provider that answers `null` ("I know no address here") is remembered as an answer, and the next
 *   provider still gets its turn — it may have the data the first one lacks;
 * - only when *every* provider failed does the caller see `ReverseGeocodingUnavailableError` (`503`).
 *
 * A provider answering `null` therefore never turns into a `503`, and two providers are never called
 * for a point the first one already resolved — which also keeps the request volume inside what these
 * free services ask for.
 */
export class FallbackReverseGeocodingService implements IReverseGeocodingService {
  constructor(private readonly services: readonly IReverseGeocodingService[]) {}

  async reverse(latitude: number, longitude: number): Promise<string | null> {
    let failure: unknown = null;
    let answeredWithoutAddress = false;

    for (const service of this.services) {
      try {
        const address = await service.reverse(latitude, longitude);

        if (address !== null) {
          return address;
        }

        answeredWithoutAddress = true;
      } catch (error) {
        // Logged because "the provider could not be reached" is an operator problem (a blocked host, a
        // rate limit) that otherwise only shows up as an anonymous `503` in the branch form.
        failure = error;
        console.warn(
          "A reverse geocoding provider failed; trying the next one",
          error,
        );
      }
    }

    if (failure !== null && !answeredWithoutAddress) {
      throw new ReverseGeocodingUnavailableError();
    }

    return null;
  }
}
