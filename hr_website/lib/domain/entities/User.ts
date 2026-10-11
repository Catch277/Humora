export interface User {
  id: string;
  full_name: string;
  role: string;
  /**
   * The branch the account belongs to (SCRUM-63); `null` means "belongs to no branch". An employee
   * with no branch reads no branch-scoped row and cannot file a request, while a manager's scope
   * comes from `branches.manager_id` — this column says *where* somebody works, not what they head.
   */
  branch_id: string | null;
}
