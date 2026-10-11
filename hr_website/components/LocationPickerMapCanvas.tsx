"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { VIETNAM_BOUNDS, VIETNAM_OUTLINE, isInsideVietnam } from "@/lib/geo/vietnam";

export type LocationPickerMapProps = {
  latitude: number | null;
  longitude: number | null;
  /** Attendance geofence radius in metres; the circle is the rule the app itself enforces. */
  radiusMeters: number;
  onPick: (latitude: number, longitude: number) => void;
};

// Anchor point of the country view, used until the form has coordinates to show.
const DEFAULT_CENTER: [number, number] = [16.5, 106.3];
const DEFAULT_ZOOM = 6;
const PICKED_ZOOM = 16;
const BOUNDS_PADDING_DEGREES = 0.6;

const MAX_BOUNDS: [[number, number], [number, number]] = [
  [
    VIETNAM_BOUNDS.minLatitude - BOUNDS_PADDING_DEGREES,
    VIETNAM_BOUNDS.minLongitude - BOUNDS_PADDING_DEGREES,
  ],
  [
    VIETNAM_BOUNDS.maxLatitude + BOUNDS_PADDING_DEGREES,
    VIETNAM_BOUNDS.maxLongitude + BOUNDS_PADDING_DEGREES,
  ],
];

// Everything outside Vietnam is dimmed by one polygon: a rectangle around the globe whose holes are
// the outline rings. Leaflet fills paths with `fill-rule: evenodd`, so the rings cut holes in it —
// which is also why the user sees where the country ends before clicking.
const WORLD_RECTANGLE: [number, number][] = [
  [-85, -180],
  [85, -180],
  [85, 180],
  [-85, 180],
];

/**
 * Colours arrive as Tailwind classes on the SVG paths rather than through `pathOptions`: Leaflet
 * writes an inline presentation attribute, which any CSS rule outranks, so the semantic tokens
 * (`stroke-primary`, `fill-primary/15` — re-pointed in dark mode) win without a literal hex here.
 */
export default function LocationPickerMapCanvas({
  latitude,
  longitude,
  radiusMeters,
  onPick,
}: LocationPickerMapProps) {
  const [notice, setNotice] = useState("");

  const position: [number, number] | null =
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
      ? null
      : [latitude, longitude];

  // Leaflet accepts the readonly generated tuples nowhere, so the rings are copied once into the
  // mutable arrays its renderer expects.
  const outlineLatLngs = useMemo<[number, number][][]>(
    () =>
      VIETNAM_OUTLINE.map((ring) =>
        ring.map(([ringLatitude, ringLongitude]): [number, number] => [
          ringLatitude,
          ringLongitude,
        ]),
      ),
    [],
  );

  const maskLatLngs = useMemo<[number, number][][]>(
    () => [WORLD_RECTANGLE, ...outlineLatLngs],
    [outlineLatLngs],
  );

  const radius = Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 0;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <MapContainer
        center={position ?? DEFAULT_CENTER}
        zoom={position ? PICKED_ZOOM : DEFAULT_ZOOM}
        minZoom={5}
        maxZoom={19}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom
        className="h-64 w-full bg-surface-muted"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polygon
          positions={maskLatLngs}
          pathOptions={{ stroke: false }}
          className="fill-slate-500/25"
        />
        <Polygon
          positions={outlineLatLngs}
          pathOptions={{ fill: false, weight: 1.5, dashArray: "6 6" }}
          className="stroke-primary"
        />

        {position && radius > 0 && (
          <Circle
            center={position}
            radius={radius}
            pathOptions={{ weight: 1.5, fillOpacity: 0.15 }}
            className="stroke-primary fill-primary"
          />
        )}

        {position && (
          <CircleMarker
            center={position}
            radius={6}
            pathOptions={{ weight: 2 }}
            className="stroke-surface fill-primary"
          />
        )}

        <ClickToPick
          onPick={(pickedLatitude, pickedLongitude) => {
            setNotice("");
            onPick(pickedLatitude, pickedLongitude);
          }}
          onReject={() =>
            setNotice("Toạ độ này nằm ngoài lãnh thổ Việt Nam. Vui lòng chọn lại.")
          }
        />

        {position && <FollowSelection latitude={position[0]} longitude={position[1]} />}
      </MapContainer>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-app px-3 py-2">
        <p className="text-[11px] text-slate-500">
          Nhấp vào bản đồ để đặt tâm chi nhánh — chỉ nhận toạ độ trong lãnh thổ Việt Nam.
        </p>
        {notice && <p className="text-[11px] font-semibold text-rose-600">{notice}</p>}
      </div>
    </div>
  );
}

function ClickToPick({
  onPick,
  onReject,
}: {
  onPick: (latitude: number, longitude: number) => void;
  onReject: () => void;
}) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng;

      if (!isInsideVietnam(lat, lng)) {
        onReject();
        return;
      }

      onPick(lat, lng);
    },
  });

  return null;
}

/**
 * Brings a coordinate that came from outside the map (the "Lấy vị trí hiện tại" button, or a
 * hand-typed pair) into view — but never moves a map the point is already visible on, so clicking
 * the map itself does not jump the view.
 */
function FollowSelection({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!isInsideVietnam(latitude, longitude)) {
      return;
    }

    if (map.getBounds().contains([latitude, longitude])) {
      return;
    }

    map.setView([latitude, longitude], Math.max(map.getZoom(), PICKED_ZOOM));
  }, [map, latitude, longitude]);

  return null;
}
