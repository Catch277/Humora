import { ReverseGeocodingUnavailableError } from "@/lib/domain/errors/ReverseGeocodingUnavailableError";
import type { IReverseGeocodingService } from "@/lib/domain/repositories/IReverseGeocodingService";

const NOMINATIM_REVERSE_ENDPOINT =
  "https://nominatim.openstreetmap.org/reverse";

/**
 * Nominatim is OpenStreetMap's geocoder — the same project the branch map already draws its tiles
 * from — and it needs no API key, so nothing secret has to be configured for this lookup.
 *
 * Its usage policy requires a User-Agent that names the application (a stock library one is
 * refused) and asks clients to stay below one request per second, which one lookup per map click
 * satisfies. Add a contact address to this string before a public deployment — the policy asks for
 * one so the maintainers can reach the operator of a busy client.
 */
const USER_AGENT = "HumoraHR-Website/1.0 (branch geofence setup)";

/** The API caps `address` at 300 characters (app/api/branches/_lib/branchRequest.ts). */
const MAX_ADDRESS_LENGTH = 300;

/** An external lookup must not hold a route handler open when the provider hangs. */
const REQUEST_TIMEOUT_MS = 8000;

/** Row shape of `format=jsonv2`; declared locally because only `display_name` is used. */
type NominatimReverseResult = {
  display_name?: unknown;
};

export class NominatimReverseGeocodingService implements IReverseGeocodingService {
  async reverse(latitude: number, longitude: number): Promise<string | null> {
    const url = new URL(NOMINATIM_REVERSE_ENDPOINT);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", latitude.toFixed(6));
    url.searchParams.set("lon", longitude.toFixed(6));
    // The operator reads Vietnamese addresses, and on points OSM stores under several names this
    // token decides which one comes back.
    url.searchParams.set("accept-language", "vi");

    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Offline, DNS failure or timeout: the caller keeps its coordinates and asks for a typed
      // address instead of failing the form.
      throw new ReverseGeocodingUnavailableError();
    }

    if (!response.ok) {
      throw new ReverseGeocodingUnavailableError();
    }

    const payload: unknown = await response.json().catch(() => null);
    const displayName =
      typeof payload === "object" && payload !== null
        ? (payload as NominatimReverseResult).display_name
        : null;

    if (typeof displayName !== "string" || displayName.trim().length === 0) {
      // "No address for this point" is a normal answer, not a failure.
      return null;
    }

    return displayName.trim().slice(0, MAX_ADDRESS_LENGTH);
  }
}
