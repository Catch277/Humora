import type {
  CreateBranchInput,
  UpdateBranchInput,
} from "@/lib/domain/entities/Branch";

/**
 * Trims free text and collapses "blank string" into `null` so the database never stores
 * `""` for an empty address. The route handler has already validated the payload; this
 * only normalises what is persisted.
 */
export function normalizeBranchWriteInput<T extends CreateBranchInput | UpdateBranchInput>(
  input: T,
): T {
  const address = input.address?.trim();

  return {
    ...input,
    name: input.name.trim(),
    address: address ? address : null,
  };
}
