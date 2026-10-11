"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import type { LocationPickerMapProps } from "@/components/LocationPickerMapCanvas";

export type { LocationPickerMapProps };

// Leaflet reaches for `window` while its module is evaluated, so the map cannot be rendered on the
// server, and it drags in a tile layer plus the ~3 700-point Vietnam outline — none of which is
// worth loading until the branch form is actually open. `ssr: false` is allowed here because this
// wrapper is itself a client component.
const LocationPickerMapCanvas = dynamic(
  () => import("@/components/LocationPickerMapCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-surface-muted text-xs text-slate-500">
        <Loader2 size={14} className="animate-spin" />
        Đang tải bản đồ...
      </div>
    ),
  },
);

/**
 * Interactive map used by the branch form: click inside Vietnam to move the branch centre and see
 * the attendance geofence circle. Split from `LocationPickerMapCanvas` only so the Leaflet bundle
 * can be loaded lazily.
 */
export default function LocationPickerMap(props: LocationPickerMapProps) {
  return <LocationPickerMapCanvas {...props} />;
}
