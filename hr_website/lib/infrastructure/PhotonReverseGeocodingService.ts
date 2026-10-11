import { ReverseGeocodingUnavailableError } from "@/lib/domain/errors/ReverseGeocodingUnavailableError";
import type { IReverseGeocodingService } from "@/lib/domain/repositories/IReverseGeocodingService";

const PHOTON_REVERSE_ENDPOINT = "https://photon.komoot.io/reverse";

/**
 * Photon is Komoot's free geocoder over the *same* OpenStreetMap data as Nominatim, so it answers in
 * the same vocabulary and needs no API key either — which makes it the natural second provider when
 * Nominatim cannot be reached (see `FallbackReverseGeocodingService`).
 *
 * It asks for an application User-Agent as well; without one it answers `400`.
 */
const USER_AGENT = "HumoraHR-Website/1.0 (branch geofence setup)";

/** The API caps `address` at 300 characters (app/api/branches/_lib/branchRequest.ts). */
const MAX_ADDRESS_LENGTH = 300;

/** An external lookup must not hold a route handler open when the provider hangs. */
const REQUEST_TIMEOUT_MS = 8000;

/** The `properties` of one GeoJSON feature; declared locally because only the address fields are read. */
type PhotonProperties = {
  name?: unknown;
  housenumber?: unknown;
  street?: unknown;
  locality?: unknown;
  district?: unknown;
  city?: unknown;
  county?: unknown;
  state?: unknown;
  country?: unknown;
};

type PhotonFeature = {
  properties?: unknown;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Builds a Vietnamese-style address — smallest first, the way the branch form and the operators read
 * it: `[POI] [số nhà + đường], [khu phố], [phường/xã], [thành phố], [tỉnh], Việt Nam`.
 *
 * A part is skipped when an earlier one already contains it (Photon's `county` often repeats
 * `district` + `city`, and a POI name frequently carries the city name too), and `county` is only used
 * when there is no `city` at all.
 */
function composeAddress(properties: PhotonProperties): string | null {
  const streetLine = [asText(properties.housenumber), asText(properties.street)]
    .filter((part): part is string => part !== null)
    .join(" ");
  const city = asText(properties.city);

  const candidates = [
    asText(properties.name),
    streetLine.length > 0 ? streetLine : null,
    asText(properties.locality),
    asText(properties.district),
    city,
    city === null ? asText(properties.county) : null,
    asText(properties.state),
    asText(properties.country),
  ];
  const parts: string[] = [];

  for (const candidate of candidates) {
    if (candidate === null) {
      continue;
    }

    if (parts.join(", ").toLowerCase().includes(candidate.toLowerCase())) {
      continue;
    }

    parts.push(candidate);
  }

  return parts.length > 0
    ? parts.join(", ").slice(0, MAX_ADDRESS_LENGTH)
    : null;
}

export class PhotonReverseGeocodingService implements IReverseGeocodingService {
  async reverse(latitude: number, longitude: number): Promise<string | null> {
    const url = new URL(PHOTON_REVERSE_ENDPOINT);
    url.searchParams.set("lat", latitude.toFixed(6));
    url.searchParams.set("lon", longitude.toFixed(6));

    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ReverseGeocodingUnavailableError();
    }

    if (!response.ok) {
      throw new ReverseGeocodingUnavailableError();
    }

    const payload: unknown = await response.json().catch(() => null);
    const features =
      typeof payload === "object" &&
      payload !== null &&
      Array.isArray((payload as { features?: unknown }).features)
        ? ((payload as { features: unknown[] }).features as (PhotonFeature | null)[])
        : null;

    if (features === null) {
      // A body that is not the documented GeoJSON envelope is a provider failure, not "no address".
      throw new ReverseGeocodingUnavailableError();
    }

    const first = features[0];

    if (!first || typeof first !== "object") {
      // An empty collection is a normal answer: nobody mapped that point yet.
      return null;
    }

    const properties = first.properties;

    if (typeof properties !== "object" || properties === null) {
      return null;
    }

    return composeAddress(properties as PhotonProperties);
  }
}
