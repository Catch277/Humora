import type {
  CreateFacilityInput,
  UpdateFacilityInput,
} from "@/lib/domain/entities/Facility";

/**
 * Trims free text and collapses "blank string" into `null`, so the database never stores `""` for an
 * absent note or check date. The route handler has already validated the payload; this only normalises
 * what is persisted. The asset code is not part of the write any more (SCRUM-67) — the use case adds it
 * after this runs, which is why it is left untouched here.
 */
export function normalizeFacilityWriteInput<
  T extends CreateFacilityInput | UpdateFacilityInput,
>(input: T): T {
  const note = input.note?.trim().replace(/\s+/g, " ");

  return {
    ...input,
    name: input.name.trim(),
    note: note ? note : null,
  };
}
