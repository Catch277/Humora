import Image from "next/image";

/**
 * The Humora logo mark — the HR monogram — in the square the shell and the two public cards show next to
 * the product name.
 *
 * Three decisions worth keeping:
 *
 * - **The artwork is referenced by path, not imported.** `public/humora-logo.png` is branding rather
 *   than code, so a build must not depend on it being present: a static import would fail `npm run
 *   build` on a tree where nobody dropped the file in yet, while a path resolves at request time and a
 *   missing file is a 404 next to a broken image — a visible, harmless symptom.
 * - **`alt=""`.** Every call site renders the "Humora" wordmark immediately beside the mark, so the
 *   name is announced once already; a second "Humora logo" is noise for a screen reader. That is also
 *   why there is no copy for this file to translate.
 * - **The white chip is what makes it legible in the dark theme.** The PNG carries its own light
 *   background; on a dark sidebar the mark would otherwise sit in a white rectangle that looks like a
 *   bug. A transparent-background asset would let the chip go (drop `bg-white` then).
 */
const LOGO_SRC = "/humora-logo.png";

type BrandMarkProps = {
  /** The square the mark sits in; every call site keeps its own header height. */
  className?: string;
};

export default function BrandMark({ className = "h-8 w-8" }: BrandMarkProps) {
  return (
    <span
      className={`flex ${className} shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 shadow-sm`}
    >
      <Image
        src={LOGO_SRC}
        alt=""
        width={64}
        height={64}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
