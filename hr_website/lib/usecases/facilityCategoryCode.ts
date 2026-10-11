import {
  FACILITY_CATEGORY_CODE_PATTERN,
  MAX_FACILITY_CATEGORY_CODE_LENGTH,
} from "@/lib/domain/entities/Facility";
import { FacilityCategoryInputError } from "@/lib/domain/errors/FacilityCategoryInputError";

/** How many `_2`, `_3` … variants of one code are tried before the name is called unusable. */
const MAX_CODE_SUFFIX = 99;

/**
 * The `facilities.category` value for a category an operator named (SCRUM-65): diacritics stripped,
 * uppercased, everything that is not a letter or a digit collapsed into `_`.
 *
 * "Máy móc" → `MAY_MOC`, "Bảo quản lạnh" → `BAO_QUAN_LANH`. The result has to satisfy
 * `FACILITY_CATEGORY_CODE_PATTERN`, which is also the database's CHECK, because the code is stored in
 * `facilities.category` and a category whose name is nothing but punctuation still needs a code.
 */
export function facilityCategoryCode(name: string): string {
  const code = name
    .normalize("NFD")
    // Vietnamese diacritics are combining marks; `đ` is a precomposed letter rather than a decorated `d`,
    // so it needs its own rule.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_FACILITY_CATEGORY_CODE_LENGTH);

  return FACILITY_CATEGORY_CODE_PATTERN.test(code) ? code : "CATEGORY";
}

/**
 * A code no category of the organization uses yet. Two names may well reduce to one code — "Nội thất" and
 * "Nội thất 2" both start with `NOI_THAT` — and `(organization_id, code)` is unique, so the second one
 * takes the first free suffix instead of failing the insert.
 */
export function uniqueFacilityCategoryCode(
  code: string,
  existing: readonly { code: string }[],
): string {
  const taken = new Set(existing.map((category) => category.code));

  if (!taken.has(code)) {
    return code;
  }

  for (let suffix = 2; suffix <= MAX_CODE_SUFFIX; suffix += 1) {
    const candidate = `${code.slice(0, MAX_FACILITY_CATEGORY_CODE_LENGTH - 6)}_${suffix}`;

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new FacilityCategoryInputError(
    "There are too many categories with a similar name. Please use a different name.",
  );
}
