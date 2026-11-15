"use client";

/**
 * A horizontal bar list for the per-branch chart (A5/SCRUM-98).
 *
 * Horizontal on purpose: a branch name ("HUFLIT Sư Vạn Hạnh") does not fit under a column on a 393 px
 * screen, and a row leaves room for the exact figure, its share of the total and a second line of
 * context. Every row is a `<button>`: choosing a branch is how the whole dashboard is filtered.
 */
export type BranchBarRow = {
  key: string;
  name: string;
  /** The exact metric, already formatted. */
  valueLabel: string;
  /** Share of the scope total, already formatted (`42,1%`). */
  ratioLabel: string;
  /** 0–100, relative to the biggest row, so the bars stay comparable. */
  barRatio: number;
  /** Second line, e.g. `5/6 đang làm`. */
  note?: string;
  /** A row that is a bucket rather than a branch (chưa gán chi nhánh) cannot be selected. */
  disabled?: boolean;
};

type Props = {
  rows: readonly BranchBarRow[];
  ariaLabel: string;
  emptyLabel: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
};

export default function BranchBarList({
  rows,
  ariaLabel,
  emptyLabel,
  selectedKey = null,
  onSelect,
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-xs text-slate-400">{emptyLabel}</p>
    );
  }

  return (
    <ul aria-label={ariaLabel} className="mt-3 space-y-1">
      {rows.map((row) => {
        const selected = row.key === selectedKey;
        const disabled = row.disabled === true || typeof onSelect !== "function";

        return (
          <li key={row.key}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect?.(row.key)}
              aria-pressed={selected}
              className={`block w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                selected ? "bg-blue-50" : "hover:bg-slate-50"
              } ${disabled ? "cursor-default" : ""}`}
            >
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                  {row.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-slate-900">
                  {row.valueLabel}
                </span>
                <span className="w-14 shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-slate-400">
                  {row.ratioLabel}
                </span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, Math.max(0, row.barRatio))}%`,
                  }}
                />
              </span>
              {row.note && (
                <span className="mt-1 block truncate text-[10px] text-slate-500">
                  {row.note}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
