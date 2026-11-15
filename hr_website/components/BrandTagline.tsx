/**
 * The brand line under the wordmark: **CONNECTING PEOPLE & GROWTH**, navy then green, letter-spaced the way
 * the logo lockup sets it.
 *
 * One component for four call sites — the desktop rail, the phone drawer, and the `/login` and `/register`
 * cards — because the two-tone split is the part that drifts when it is copy-pasted, and because the colours
 * have to come from the brand tokens in `app/globals.css` (they are re-pointed for the dark theme; a literal
 * hex could not be).
 *
 * The phrase is one text node split by two `span`s for colour only, so it is announced as one sentence.
 *
 * `compact` is the rail's setting, not a style preference: `w-64` minus its 20px gutters, the 32px mark and the
 * 12px gap leaves ~172px for the label, while the drawer and the public cards have ~100px more. At the
 * lockup's `text-[10px] / 0.15em` the line measures ~190px, so the rail steps one size down with slightly
 * tighter tracking — the alternative was wrapping "& GROWTH" onto a second line, which breaks the lockup's
 * one-line alignment with the wordmark.
 */
type BrandTaglineProps = {
  /** Spacing belongs to the caller; size and colour do not. */
  className?: string;
  /** The ~172px column inside the desktop rail (`components/Sidebar.tsx`). */
  compact?: boolean;
};

export default function BrandTagline({
  className = "",
  compact = false,
}: BrandTaglineProps) {
  // `whitespace-nowrap` on purpose: this line is a lockup, and a wrapped brand sentence reads as a bug.
  const typography = compact
    ? "text-[9px] tracking-[0.08em]"
    : "text-[10px] tracking-[0.15em]";

  return (
    <p className={`${typography} font-semibold whitespace-nowrap ${className}`.trim()}>
      <span className="text-brand-navy">CONNECTING</span>{" "}
      <span className="text-brand-green">PEOPLE &amp; GROWTH</span>
    </p>
  );
}
