/**
 * Regenerates `lib/geo/vietnamOutline.ts`, the land outline the branch picker enforces.
 *
 * Source: Natural Earth 1:10m Admin 0 – Countries (public domain, no attribution required) — the
 * feature whose `ADMIN` is "Vietnam". Nothing in the generated file is hand-drawn: this script
 * downloads the source, simplifies it with Douglas–Peucker, checks the result against a list of
 * real coordinates (Vietnamese cities, border towns, Vientiane, offshore points), reports the worst
 * deviation from the unsimplified geometry, and only then writes the module.
 *
 * Usage: node scripts/extract-vietnam-outline.mjs [mainlandToleranceDeg] [islandToleranceDeg]
 *        VN_SOURCE=<path to a downloaded copy> node scripts/extract-vietnam-outline.mjs
 *
 * Deliberately NOT wired into `predev` / `prebuild`: it downloads ~13 MB, and the committed output
 * should only change when someone decides the outline should. Run it, read the report, review the
 * diff and commit both files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";
const TARGET = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "geo",
  "vietnamOutline.ts",
);

// Natural Earth 1:10m keeps its vertices ~1 km apart, so a tolerance far below that buys accuracy
// that is not in the data. The mainland carries the tolerance; the islands (a few hundred points
// in total) keep a finer one, because generalising an island such as Côn Đảo swallows its bays.
const MAINLAND_TOLERANCE_DEG = Number(process.argv[2] ?? 0.001); // ~110 m
const ISLAND_TOLERANCE_DEG = Number(process.argv[3] ?? 0.0005); // ~55 m
// Rings below this area are islets no branch can sit on; they also keep the payload small.
const MIN_RING_AREA_KM2 = 5;
const DECIMALS = 5; // ~1 m at this latitude

const source = await loadSource();
const feature = source.features.find(
  (candidate) => candidate.properties.ADMIN === "Vietnam" || candidate.properties.ISO_A3 === "VNM",
);
if (!feature) {
  throw new Error("The source GeoJSON has no Vietnam feature.");
}

const polygons =
  feature.geometry.type === "MultiPolygon"
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];

async function loadSource() {
  const localCopy = process.env.VN_SOURCE;
  if (localCopy) {
    return JSON.parse(readFileSync(localCopy, "utf8"));
  }

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Could not download ${SOURCE_URL}: HTTP ${response.status}`);
  }
  return response.json();
}

function toRing(polygon) {
  return polygon[0].map(([longitude, latitude]) => [
    Number(latitude.toFixed(DECIMALS)),
    Number(longitude.toFixed(DECIMALS)),
  ]);
}

/** Distance from `point` to the segment `start`–`end`, in the units the inputs use. */
function distanceToSegment(point, start, end) {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  if (segmentX === 0 && segmentY === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * segmentX + (point[1] - start[1]) * segmentY) / lengthSquared,
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + projection * segmentX),
    point[1] - (start[1] + projection * segmentY),
  );
}

/** Douglas–Peucker over a closed ring, iterative so a 3 000-point ring cannot blow the stack. */
function simplifyRing(ring, tolerance) {
  const count = ring.length;
  if (count < 4) {
    return ring.slice();
  }

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  // A closed ring has no natural start, so the point farthest from the first vertex splits it in
  // two open lines that can be simplified as usual.
  let farthest = 0;
  let farthestDistance = -1;
  for (let index = 1; index < count - 1; index += 1) {
    const distance = Math.hypot(ring[index][0] - ring[0][0], ring[index][1] - ring[0][1]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthest = index;
    }
  }
  keep[farthest] = 1;

  const stack = [
    [0, farthest],
    [farthest, count - 1],
  ];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    if (end - start < 2) {
      continue;
    }

    let worst = 0;
    let worstIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = distanceToSegment(ring[index], ring[start], ring[end]);
      if (distance > worst) {
        worst = distance;
        worstIndex = index;
      }
    }

    if (worstIndex > 0 && worst > tolerance) {
      keep[worstIndex] = 1;
      stack.push([start, worstIndex], [worstIndex, end]);
    }
  }

  return ring.filter((_, index) => keep[index] === 1);
}

/** Planar approximation of a ring's area; exact enough to sort rings and drop the smallest ones. */
function areaKm2(ring) {
  let twiceArea = 0;
  let latitudeSum = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    twiceArea += (ring[previous][0] + ring[index][0]) * (ring[previous][1] - ring[index][1]);
    latitudeSum += ring[index][0];
  }

  const kilometersPerLongitudeDegree =
    111.32 * Math.cos(((latitudeSum / ring.length) * Math.PI) / 180);
  return Math.abs(twiceArea / 2) * 111.32 * kilometersPerLongitudeDegree;
}

const rings = polygons
  .map((polygon) => {
    const ring = toRing(polygon);
    return simplifyRing(
      ring,
      areaKm2(ring) > 1000 ? MAINLAND_TOLERANCE_DEG : ISLAND_TOLERANCE_DEG,
    );
  })
  .filter((ring) => ring.length >= 4 && areaKm2(ring) >= MIN_RING_AREA_KM2)
  .sort((left, right) => areaKm2(right) - areaKm2(left));

/** Point-in-polygon by ray casting; used to check the generated rings, not to render them. */
function isInRings(ringList, latitude, longitude) {
  return ringList.some((ring) => {
    let inside = false;
    for (
      let index = 0, previous = ring.length - 1;
      index < ring.length;
      previous = index, index += 1
    ) {
      const [startLatitude, startLongitude] = ring[previous];
      const [endLatitude, endLongitude] = ring[index];
      const crossesEdge = startLatitude > latitude !== endLatitude > latitude;
      const intersectsRay =
        longitude <
        ((endLongitude - startLongitude) * (latitude - startLatitude)) /
          (endLatitude - startLatitude) +
          startLongitude;

      if (crossesEdge && intersectsRay) {
        inside = !inside;
      }
    }
    return inside;
  });
}

/**
 * Shortest distance from a point to a ring, in metres. Equirectangular projection is exact enough
 * here: the distances involved are metres, and the error grows with distance from the point, which
 * is irrelevant when all we ask is "is this point within a couple of hundred metres of the edge?".
 */
function distanceToRingMeters(latitude, longitude, ring) {
  const metersPerLongitudeDegree = 111320 * Math.cos((latitude * Math.PI) / 180);
  const toLocalMeters = ([ringLatitude, ringLongitude]) => [
    (ringLongitude - longitude) * metersPerLongitudeDegree,
    (ringLatitude - latitude) * 110574,
  ];

  let closest = Number.POSITIVE_INFINITY;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const start = toLocalMeters(ring[previous]);
    const end = toLocalMeters(ring[index]);
    const segmentX = end[0] - start[0];
    const segmentY = end[1] - start[1];
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, -(start[0] * segmentX + start[1] * segmentY) / lengthSquared),
          );

    closest = Math.min(
      closest,
      Math.hypot(start[0] + projection * segmentX, start[1] + projection * segmentY),
    );
  }
  return closest;
}

function distanceToRingsMeters(ringList, latitude, longitude) {
  return ringList.reduce(
    (closest, ring) => Math.min(closest, distanceToRingMeters(latitude, longitude, ring)),
    Number.POSITIVE_INFINITY,
  );
}

// Every coordinate below is a real place, and the expectation is what a person reading a map would
// say about it. They are the reason the generated file can be trusted: if a future edit to this
// script or to the source data moves the outline, one of them fails loudly.
const checks = [
  ["Hà Nội", 21.0285, 105.8542, true],
  ["Đà Nẵng", 16.0544, 108.2022, true],
  ["TP. Hồ Chí Minh", 10.7769, 106.7009, true],
  ["Cần Thơ", 10.0452, 105.7469, true],
  ["Cà Mau", 9.1769, 105.15, true],
  ["Vũng Tàu", 10.346, 107.0843, true],
  ["Quy Nhơn", 13.7829, 109.2196, true],
  ["Nha Trang", 12.2388, 109.1967, true],
  ["Hải Phòng", 20.8449, 106.6881, true],
  ["Sa Pa (20 km from the Chinese border)", 22.3364, 103.8438, true],
  ["Phú Quốc", 10.227, 103.964, true],
  ["Côn Đảo (Cỏ Ống airport)", 8.7318, 106.6326, true],
  ["Cát Bà", 20.728, 107.048, true],
  ["Lào Cai (Chinese border gate)", 22.4833, 103.9667, true],
  ["Đồng Đăng, Lạng Sơn (border gate)", 21.945, 106.696, true],
  ["Điện Biên Phủ (Lao border)", 21.386, 103.0233, true],
  ["Lao Bảo, Quảng Trị (border gate)", 16.62, 106.6, true],
  ["Hà Tiên (Cambodian border)", 10.3833, 104.4833, true],
  ["Vientiane (Laos)", 17.9757, 102.6331, false],
  ["Phnom Penh (Cambodia)", 11.5564, 104.9282, false],
  ["Dongxing (China, across from Móng Cái)", 21.545, 107.97, false],
  ["Nanning (China)", 22.817, 108.3665, false],
  ["Sanya (China)", 18.2528, 109.5119, false],
  ["Offshore Vũng Tàu (~5 km out)", 10.346, 107.14, false],
  ["Gulf of Tonkin (open sea)", 20.0, 108.5, false],
  ["Offshore Nha Trang (open sea)", 12.2, 109.8, false],
];

// The same rings before simplification, used only to measure what simplification cost.
const sourceRings = polygons
  .map(toRing)
  .filter((ring) => ring.length >= 4 && areaKm2(ring) >= MIN_RING_AREA_KM2);

let failures = 0;
for (const [name, latitude, longitude, expected] of checks) {
  const inside = isInRings(rings, latitude, longitude);
  const distance = distanceToRingsMeters(rings, latitude, longitude);
  if (inside !== expected) {
    failures += 1;
  }
  console.log(
    `${inside === expected ? "ok  " : "FAIL"} ${name}: ${inside} (closest edge ${distance.toFixed(0)} m)`,
  );
}

// Simplification must not move the outline further than the tolerance asked for; anything else
// would mean the generated file claims an accuracy the simplification did not deliver.
let worstDeviation = 0;
let worstVertex = null;
for (const ring of sourceRings) {
  for (const vertex of ring) {
    const distance = distanceToRingsMeters(rings, vertex[0], vertex[1]);
    if (distance > worstDeviation) {
      worstDeviation = distance;
      worstVertex = vertex;
    }
  }
}

const points = rings.reduce((total, ring) => total + ring.length, 0);
console.log(
  `${rings.length} rings / ${points} points, ${failures} failed check(s), worst deviation from the source geometry ${worstDeviation.toFixed(0)} m at ${JSON.stringify(worstVertex)}`,
);
if (failures > 0) {
  console.error("Refusing to write the outline while a check fails.");
  process.exit(1);
}

const outline = rings
  .map((ring) => `  [\n${ring.map(([latitude, longitude]) => `    [${latitude}, ${longitude}],`).join("\n")}\n  ],`)
  .join("\n");

writeFileSync(
  TARGET,
  `/**
 * Vietnam land outline — generated by \`node scripts/extract-vietnam-outline.mjs\`, do not edit by hand.
 *
 * Source: Natural Earth 1:10m Admin 0 – Countries (public domain), feature \`ADMIN = "Vietnam"\`,
 * simplified with Douglas–Peucker at ${MAINLAND_TOLERANCE_DEG}° (~110 m) for the mainland and
 * ${ISLAND_TOLERANCE_DEG}° (~55 m) for the islands, coordinates rounded to ${DECIMALS} decimals (~1 m), and rings
 * smaller than ${MIN_RING_AREA_KM2} km² dropped (no branch fits on them anyway). ${rings.length} rings, ${points} points.
 *
 * Accuracy: the worst deviation from the unsimplified source geometry is ${worstDeviation.toFixed(0)} m, but Natural
 * Earth itself generalises real borders and coastlines by a few hundred metres — more in remote or
 * estuary-heavy stretches. This is a strong guard for "the branch must be in Vietnam", not a survey.
 *
 * Shape: one entry per closed polygon ring of \`[latitude, longitude]\` pairs; the first ring is the
 * mainland and the rest are islands (Phú Quốc, Côn Đảo, Cát Bà, the Cẩm Phả / Vân Đồn archipelago).
 */
export type VietnamCoordinate = readonly [number, number];

export const VIETNAM_OUTLINE: readonly (readonly VietnamCoordinate[])[] = [
${outline}
];
`,
  "utf8",
);

console.log(`Wrote ${TARGET}`);
