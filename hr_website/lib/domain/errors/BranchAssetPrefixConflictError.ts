/**
 * Two branches were created at the same moment (SCRUM-67). The number is `max(asset_prefix) + 1`, computed
 * by `SupabaseBranchRepository.create()` from the branches the session can read, and
 * `branches_organization_asset_prefix_key` is what actually decides: the repository retries once and
 * raises this when the second attempt loses as well.
 *
 * Answers `409`. The branch was **not** created, so the owner can simply save the form again — which is
 * why the sentence says that instead of naming a field to fix.
 */
export class BranchAssetPrefixConflictError extends Error {
  constructor() {
    super(
      "Không cấp được số thứ tự cho chi nhánh vì một chi nhánh khác vừa được tạo cùng lúc. Vui lòng lưu lại.",
    );
    this.name = "BranchAssetPrefixConflictError";
  }
}
