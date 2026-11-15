"use client";

/**
 * A donut chart drawn with SVG arcs (`stroke-dasharray` on one circle per slice), plus a legend that
 * carries the exact count and its share (A5/SCRUM-98).
 *
 * The arcs are decorative (`aria-hidden`); the legend is the interactive part — each row is a real
 * `<button>` with `aria-pressed`, which is both the accessible and the thumb-sized target on a phone.
 * Selecting a slice dims the others so a reader can see which number the footnote belongs to.
 */
export type DonutSliceTone = "primary" | "emerald" | "amber" | "rose" | "slate";

export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  /** Right-hand annotation, already formatted: `12 · 48,0%`. */
  valueLabel: string;
  tone: DonutSliceTone;
};

type Props = {
  slices: readonly DonutSlice[];
  ariaLabel: string;
  emptyLabel: string;
  /** The figure in the middle (already formatted). */
  centerValue: string;
  centerCaption?: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
};

const TONE_STROKE: Record<DonutSliceTone, string> = {
  primary: "stroke-primary",
  emerald: "stroke-emerald-500",
  amber: "stroke-amber-500",
  rose: "stroke-rose-500",
  slate: "stroke-slate-300",
};

const TONE_DOT: Record<DonutSliceTone, string> = {
  primary: "bg-primary",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-300",
};

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DonutChart({
  slices,
  ariaLabel,
  emptyLabel,
  centerValue,
  centerCaption,
  selectedKey = null,
  onSelect,
}: Props) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return <p className="py-10 text-center text-xs text-slate-400">{emptyLabel}</p>;
  }

  const interactive = typeof onSelect === "function";

  return (
    <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 140 140"
        aria-hidden="true"
        className="h-36 w-36 shrink-0"
      >
        <circle
          cx="70"
          cy="70"
          r={RADIUS}
          fill="none"
          strokeWidth="16"
          className="stroke-slate-100"
        />
        {slices.map((slice, index) => {
          const before = slices
            .slice(0, index)
            .reduce((sum, previous) => sum + previous.value, 0);
          const length = (slice.value / total) * CIRCUMFERENCE;
          const offset = (before / total) * CIRCUMFERENCE;
          const dimmed =
            selectedKey !== null && slice.key !== selectedKey && slice.value > 0;

          if (slice.value <= 0) {
            return null;
          }

          return (
            <circle
              key={slice.key}
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              strokeWidth="16"
              strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              className={`${TONE_STROKE[slice.tone]} transition-opacity ${
                dimmed ? "opacity-30" : "opacity-100"
              }`}
            />
          );
        })}
        <text
          x="70"
          y={centerCaption ? 66 : 74}
          textAnchor="middle"
          className="fill-slate-900 text-[18px] font-bold"
        >
          {centerValue}
        </text>
        {centerCaption && (
          <text
            x="70"
            y="82"
            textAnchor="middle"
            className="fill-slate-400 text-[8px]"
          >
            {centerCaption}
          </text>
        )}
      </svg>

      <ul className="w-full min-w-0 flex-1 space-y-1" aria-label={ariaLabel}>
        {slices.map((slice) => {
          const selected = slice.key === selectedKey;
          const disabled = !interactive || slice.value <= 0;

          return (
            <li key={slice.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect?.(slice.key)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                  selected ? "bg-blue-50" : "hover:bg-slate-50"
                } ${disabled ? "cursor-default" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[slice.tone]}`}
                />
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {slice.label}
                </span>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-slate-800">
                  {slice.valueLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
