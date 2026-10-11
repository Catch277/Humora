/**
 * What the `staff-account` Edge Function answers after creating an account (SCRUM-52). The
 * temporary password is deliberately not part of the result: the owner typed it, it is never
 * stored anywhere, and only the owner can repeat it.
 */
export interface StaffProvisionResult {
  user_id: string;
  email: string;
  must_change_password: boolean;
}