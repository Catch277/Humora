/**
 * Turns a GPS point into an address an operator can read, so the branch form can fill its address
 * field from the pin instead of asking for it to be typed.
 *
 * `null` means the provider knows no address for that point (a spot at sea, or a street nobody has
 * mapped yet) — a normal answer, not a failure. A provider failure throws
 * `ReverseGeocodingUnavailableError`.
 */
export interface IReverseGeocodingService {
  reverse(latitude: number, longitude: number): Promise<string | null>;
}
