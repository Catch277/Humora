"use client";

/**
 * A column chart with no dependency behind it (A5/SCRUM-98): plain divs inside one scroller, so a
 * 31-day month can be swiped on a phone and the columns stay real buttons (`<button>`) for keyboard
 * and screen-reader users.
 *
 * It formats nothing: every string (`valueLabel`, `label`) is already localized by the caller, which
 * keeps this component free of `Intl` and of the reader's locale.
 */
export type ColumnChartPoint = {
  key: string;
  label: string;
  value: number;
  /** The exact figure, already formatted (`100.000 ₫`, `12`). */
  valueLabel: string;
  /** Tooltip second line, e.g. "3 ca đã chốt". */
  note?: string;
};

type Props = {
  points: readonly ColumnChartPoint[];
  ariaLabel: string;
  emptyLabel: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** How many axis labels survive thinning out (a 31-day month keeps about ten). */
  axisLabelLimit?: number;
};

export default function ColumnChart({
  points,
  ariaLabel,
  emptyLabel,
  selectedKey = null,
  onSelect,
  axisLabelLimit = 10,
}: Props) {
  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-slate-400">{emptyLabel}</p>
    );
  }

  const max = points.reduce((peak, point) => Math.max(peak, point.value), 0);
  const step = Math.max(1, Math.ceil(points.length / Math.max(1, axisLabelLimit)));
  const interactive = typeof onSelect === "function";

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="mt-3 flex h-44 items-stretch gap-1 overflow-x-auto pb-1"
    >
      {points.map((point, index) => {
        const height =
          max > 0 ? Math.max(2, Math.round((point.value / max) * 100)) : 2;
        const selected = point.key === selectedKey;
        // Only the peak and the selected column carry a printed value: 31 numbers over 31 bars is
        // noise, and every column still has its exact figure in the tooltip and in the footer.
        const showValue = point.value > 0 && (point.value === max || selected);
        const label =
          index % step === 0 || index === points.length - 1 ? point.label : "";
        const body = (
          <>
            <span className="mb-1 h-3 truncate text-center text-[9px] leading-3 tabular-nums text-slate-500">
              {showValue ? point.valueLabel : ""}
            </span>
            <span className="flex w-full flex-1 flex-col justify-end">
              <span
                style={{ height: `${height}%` }}
                className={`w-full rounded-t transition-colors ${
                  point.value === 0
                    ? "bg-slate-200"
                    : selected
                      ? "bg-primary"
                      : "bg-primary/70"
                }`}
              />
            </span>
            <span className="mt-1 h-4 truncate text-center text-[9px] leading-4 text-slate-400">
              {label}
            </span>
          </>
        );
        const title = point.note
          ? `${point.label}: ${point.valueLabel} · ${point.note}`
          : `${point.label}: ${point.valueLabel}`;

        return interactive ? (
          <button
            key={point.key}
            type="button"
            onClick={() => onSelect?.(point.key)}
            aria-pressed={selected}
            aria-label={title}
            title={title}
            className={`flex h-full min-w-[14px] flex-1 flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              selected ? "bg-blue-50/60" : ""
            }`}
          >
            {body}
          </button>
        ) : (
          <div
            key={point.key}
            title={title}
            className="flex h-full min-w-[14px] flex-1 flex-col justify-end"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
