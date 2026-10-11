import { VIETNAM_OUTLINE } from "@/lib/geo/vietnamOutline";

export { VIETNAM_OUTLINE };
export type { VietnamCoordinate } from "@/lib/geo/vietnamOutline";

/**
 * A box around Vietnam: the envelope of every ring of `VIETNAM_OUTLINE` (the outline reaches
 * 8.5656–23.3663° N, 102.1187–109.4724° E) padded by 0.022° on each side — more than the tolerance
 * below, so anything `isInsideVietnam` accepts also passes this box and the database's copy of it.
 *
 * It is the cheap first test and the only test a `CHECK` constraint can express
 * (`branches_vietnam_bounds_check` in supabase/sql/SCRUM-57_vietnam_bounds.sql, and the `minimum` /
 * `maximum` in the `@swagger` blocks of app/api/branches). A box decides nothing — it accepts Laos,
 * the sea and everything between — so `isInsideVietnam` is the rule that matters.
 */
export const VIETNAM_BOUNDS = {
  minLatitude: 8.5436,
  maxLatitude: 23.3883,
  minLongitude: 102.0967,
  maxLongitude: 109.4944,
} as const;

/**
 * How far outside the outline a point may still be accepted, in metres.
 *
 * The outline is verified to stay within 110 m of the Natural Earth geometry
 * (`scripts/extract-vietnam-outline.mjs`), but that geometry is generalised: its vertices sit about
 * 1 km apart, so the drawn coastline can run well inland of the real one. Distances measured from
 * real places to the drawn outline: Mỹ Khê (Đà Nẵng) 308 m, Dương Đông (Phú Quốc) 317 m, Hòn Gai
 * (Hạ Long) 615 m, the town of Côn Sơn 685 m, Cái Rồng (Vân Đồn) 1.14 km, Móng Cái 1.4 km, Mũi Cà
 * Mau 1.6 km, Phú Quý 1.7 km. Every one of those is a shop on land, so a band narrower than this
 * would refuse a branch that a `cafe` could legitimately open.
 *
 * The asymmetry is deliberate: accepting a point 2 km outside costs nothing — the attendance
 * geofence is what actually gates a check-in, the operator sees the pin on the map, and anything
 * further out is the sea or Laos — while refusing a real store blocks its staff from ever checking
 * in. What this cannot cover is ground the source omits entirely (Lý Sơn, Cù Lao Chàm and other
 * islands under ~10 km² are not in the 1:10m data, and the Trà Cổ peninsula is drawn 4.6 km away):
 * those need a finer source, not a wider band.
 */
const OUTLINE_TOLERANCE_METERS = 2000;

// WGS84 mean metres per degree of latitude; longitude shrinks with the cosine of the latitude.
const METERS_PER_DEGREE_LATITUDE = 110574;
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111320;

export function isWithinVietnamBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= VIETNAM_BOUNDS.minLatitude &&
    latitude <= VIETNAM_BOUNDS.maxLatitude &&
    longitude >= VIETNAM_BOUNDS.minLongitude &&
    longitude <= VIETNAM_BOUNDS.maxLongitude
  );
}

/**
 * True when a GPS point is inside Vietnamese territory — on land, or within the tolerance band of the
 * coastline (see `OUTLINE_TOLERANCE_METERS`).
 *
 * Coordinates in the sea, in a neighbouring country, or in a lake completely enclosed by land are
 * rejected. This is a land test, not a distance-to-the-border test: a point deep inland is in, a
 * point 3 km offshore is out even though it is closer to a Vietnamese province than to anything
 * else, and the 2 km band above is the only allowance ever made.
 */
export function isInsideVietnam(latitude: number, longitude: number): boolean {
  if (!isWithinVietnamBounds(latitude, longitude)) {
    return false;
  }

  return (
    isInsideOutline(latitude, longitude) ||
    distanceToOutlineMeters(latitude, longitude) <= OUTLINE_TOLERANCE_METERS
  );
}

/** Even-odd ray casting across every ring; 3 700 segments, so this is microseconds, not a query. */
function isInsideOutline(latitude: number, longitude: number): boolean {
  return VIETNAM_OUTLINE.some((ring) => {
    let inside = false;

    for (
      let index = 0, previous = ring.length - 1;
      index < ring.length;
      previous = index, index += 1
    ) {
      const [startLatitude, startLongitude] = ring[previous];
      const [endLatitude, endLongitude] = ring[index];
      const crossesRay = startLatitude > latitude !== endLatitude > latitude;

      if (!crossesRay) {
        continue;
      }

      const crossingLongitude =
        ((endLongitude - startLongitude) * (latitude - startLatitude)) /
          (endLatitude - startLatitude) +
        startLongitude;

      if (longitude < crossingLongitude) {
        inside = !inside;
      }
    }

    return inside;
  });
}

/**
 * Shortest distance from a point to the outline, in metres. The rings are projected with an
 * equirectangular approximation centred on the queried point, which is exact to less than a metre
 * over the few hundred metres this is ever asked about.
 */
function distanceToOutlineMeters(latitude: number, longitude: number): number {
  const metersPerLongitudeDegree =
    METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * Math.cos((latitude * Math.PI) / 180);
  let closest = Number.POSITIVE_INFINITY;

  for (const ring of VIETNAM_OUTLINE) {
    for (
      let index = 0, previous = ring.length - 1;
      index < ring.length;
      previous = index, index += 1
    ) {
      const [startLatitude, startLongitude] = ring[previous];
      const [endLatitude, endLongitude] = ring[index];
      const startX = (startLongitude - longitude) * metersPerLongitudeDegree;
      const startY = (startLatitude - latitude) * METERS_PER_DEGREE_LATITUDE;
      const segmentX = (endLongitude - longitude) * metersPerLongitudeDegree - startX;
      const segmentY = (endLatitude - latitude) * METERS_PER_DEGREE_LATITUDE - startY;
      const lengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection =
        lengthSquared === 0
          ? 0
          : Math.min(
              1,
              Math.max(0, -(startX * segmentX + startY * segmentY) / lengthSquared),
            );

      const distance = Math.hypot(
        startX + projection * segmentX,
        startY + projection * segmentY,
      );

      if (distance < closest) {
        closest = distance;
      }
    }
  }

  return closest;
}
