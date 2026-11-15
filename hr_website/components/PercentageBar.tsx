/**
 * Thanh tiến trình thời gian còn lại (SCRUM-102, C5).
 *
 * The ticket asks for a progress bar showing how much of a package's term is left, on the warranty row and
 * on the contract term. One component keeps the arithmetic (and the colour threshold) in one place: what a
 * bar shows is the *remaining* share of `[start, end]`, so a full bar means "the whole term is still ahead"
 * and an empty one means it ended today or earlier.
 *
 * The dates are business dates (`YYYY-MM-DD`), compared at UTC midnight — parsing them as instants would let
 * a timezone move the percentage by a day. `label` is a function because the sentence belongs to the screen
 * that renders it (and therefore to the active locale).
 */
export default function PercentageBar({
  start,
  end,
  today,
  label,
}: {
  start: string;
  end: string;
  today: string;
  label: (percent: number) => string;
}) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return null;
  }

  const percent = Math.max(
    0,
    Math.min(100, Math.round(((endMs - todayMs) / (endMs - startMs)) * 100)),
  );

  const tone =
    percent > 50
      ? "bg-emerald-500"
      : percent > 20
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="mt-1 w-32">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label(percent)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80"
      >
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">{label(percent)}</p>
    </div>
  );
}
