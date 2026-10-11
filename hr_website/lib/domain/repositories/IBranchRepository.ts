import type {
  Branch,
  BranchDependents,
  CreateBranchInput,
  UpdateBranchInput,
} from "@/lib/domain/entities/Branch";

export interface IBranchRepository {
  findAll(): Promise<Branch[]>;
  /** One branch as the caller may see it; `null` covers both a wrong id and another organization. */
  findById(id: string): Promise<Branch | null>;
  create(input: CreateBranchInput): Promise<Branch>;
  update(id: string, input: UpdateBranchInput): Promise<Branch>;
  /** The operational rows that still point at this branch (SCRUM-61) — what a delete would destroy. */
  countDependents(id: string): Promise<BranchDependents>;
  delete(id: string): Promise<void>;
}
