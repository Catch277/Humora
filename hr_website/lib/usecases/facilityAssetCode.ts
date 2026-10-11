import {
  BRANCH_ASSET_PREFIX_WIDTH,
  FACILITY_ASSET_CODE_PATTERN,
  FACILITY_ASSET_SEQUENCE_WIDTH,
  MAX_FACILITY_ASSET_ACRONYM_LENGTH,
} from "@/lib/domain/entities/Facility";

/**
 * The acronym a branch name with no usable letters reduces to ("Chi nhánh"): a branch called `🏪` or
 * `---` still needs letters for its asset codes.
 */
const FALLBACK_BRANCH_TOKEN = "CN";

/** How much of a word that is nothing but digits the acronym keeps: `Quận 10` → `Q10`, `Quận 1` → `Q1`. */
const MAX_NUMERIC_WORD_DIGITS = 2;

/** A one-word branch needs its first letters instead of a single initial: `HUFI` → `HUF`. */
const MIN_ACRONYM_LENGTH = 2;
const SHORT_ACRONYM_LETTERS = 3;

/** What a tag prefix needs: the branch's number (SCRUM-67) and the name it abbreviates. */
export type BranchAssetTokenSource = {
  name: string;
  /** `branches.asset_prefix`; `null` for a branch that predates SCRUM-67. */
  asset_prefix?: number | null;
};

/**
 * The initials of a branch name (SCRUM-67): "HUFLIT Sư Vạn Hạnh" → `HSVH`, "Đà Lạt" → `DL`,
 * "Quận 10" → `Q10`.
 *
 * One letter per word, because that is what an operator reads off a name they already know; a word that
 * is nothing but digits contributes its first two, so "Quận 1" and "Quận 10" do not collide. Diacritics
 * are stripped exactly as `facilityCategoryCode()` strips them (SCRUM-65), so both codes are read the same
 * way. Two branches may still abbreviate identically — that is what `branches.asset_prefix` is for.
 */
export function branchAssetAcronym(branchName: string): string {
  // Vietnamese diacritics are combining marks; `đ` is a precomposed letter rather than a decorated `d`,
  // so it needs its own rule.
  const ascii = branchName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "D");

  const words = ascii.match(/[A-Za-z0-9]+/g) ?? [];

  if (words.length === 0) {
    return FALLBACK_BRANCH_TOKEN;
  }

  const acronym = words
    .map((word) =>
      /^[0-9]+$/.test(word) ? word.slice(0, MAX_NUMERIC_WORD_DIGITS) : word[0],
    )
    .join("")
    .toUpperCase()
    .slice(0, MAX_FACILITY_ASSET_ACRONYM_LENGTH);

  // A single word has a single initial, which identifies nothing ("HUFI" → `H`), so it keeps its first
  // letters instead.
  const firstWord = words[0];

  return acronym.length < MIN_ACRONYM_LENGTH && firstWord
    ? firstWord.slice(0, SHORT_ACRONYM_LETTERS).toUpperCase()
    : acronym;
}

/**
 * The branch part of an asset code (SCRUM-67): the branch's number followed by those initials — `01HSVH`,
 * `02HSVH`. Two branches that abbreviate identically therefore get different tokens and number their
 * facilities separately.
 *
 * Without a number — a branch created before SCRUM-67, or one inserted by hand in the dashboard — the
 * token is the bare acronym, and the numbering space is then shared with every other branch that
 * abbreviates the same way, exactly as SCRUM-66 behaved.
 */
export function branchAssetToken(
  branch: BranchAssetTokenSource | null | undefined,
): string {
  const acronym = branchAssetAcronym(branch?.name ?? "");
  const prefix = branch?.asset_prefix;

  if (typeof prefix !== "number" || !Number.isSafeInteger(prefix) || prefix < 1) {
    return acronym;
  }

  return `${String(prefix).padStart(BRANCH_ASSET_PREFIX_WIDTH, "0")}${acronym}`;
}

/**
 * The code a new facility of `token`'s branch gets: `01HSVH-0001`, `01HSVH-0002`, …
 *
 * The number is one past the highest number any *existing* code with that token carries, so the sequence
 * is derived from the rows rather than from a counter table. The token names the branch (SCRUM-67), so a
 * branch counts on its own; a branch without a number shares the space of its acronym, which is the
 * SCRUM-66 behaviour. `facilities_organization_code_key` is the backstop for the race between two
 * operators saving at the same moment.
 */
export function nextFacilityAssetCode(
  token: string,
  existingCodes: readonly string[],
): string {
  // The token is digits and A-Z only (a branch number plus initials), so it carries no regex metacharacter.
  const pattern = new RegExp(`^${token}-(\\d+)$`);
  let highest = 0;

  for (const code of existingCodes) {
    const match = pattern.exec(code);

    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }

  return formatFacilityAssetCode(token, highest + 1);
}

/**
 * One asset code out of a token and a number. The number is zero-padded to `FACILITY_ASSET_SEQUENCE_WIDTH`
 * and a branch that outgrows the padding simply keeps growing (`01HSVH-10000`), so the format never
 * truncates a sequence away.
 */
export function formatFacilityAssetCode(token: string, sequence: number): string {
  const number = Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1;
  const digits = String(number).padStart(FACILITY_ASSET_SEQUENCE_WIDTH, "0");

  // `branchAssetToken()` already produces a token the pattern accepts; this keeps a caller that built one
  // by hand from writing a code no reader — or the SQL in SCRUM-67 — would recognise.
  return FACILITY_ASSET_CODE_PATTERN.test(`${token}-${digits}`)
    ? `${token}-${digits}`
    : `${FALLBACK_BRANCH_TOKEN}-${digits}`;
}
