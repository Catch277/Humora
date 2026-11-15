import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";

/**
 * The private bucket SCRUM-95 creates. A face photo is never served from a public URL: the only way to
 * read one is a signed link that this module mints for the caller who already passed RLS.
 */
export const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";

/**
 * How long a signed link stays valid. A minute is enough for the review dialog to paint and for the
 * browser to cache the image, and short enough that a copied URL is useless by the time it is shared.
 */
export const ATTENDANCE_PHOTO_URL_TTL_SECONDS = 60;

/**
 * `<org-uuid>/<employee-uuid>/<work_date>/<name>.<ext>` — the convention SCRUM-95 documents.
 *
 * Checked before signing so a row that carries something else (a legacy URL, a hand-written path) is
 * answered as "no photo" instead of being handed back to the browser as an address.
 */
const ATTENDANCE_PHOTO_PATH_PATTERN =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+$/;

export function isAttendancePhotoPath(value: string): boolean {
  return ATTENDANCE_PHOTO_PATH_PATTERN.test(value.trim());
}

/** Either a usable link or a reason the caller gets "no photo" instead of an address. */
export type AttendancePhotoLink =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; missing: boolean; error: string };

/**
 * Storage's error object is not part of this app's type surface; only these two fields matter and both
 * are read structurally (`typeof` checks), so a change in the library cannot leak an `any` in here.
 */
type StorageFailure = { message?: unknown; statusCode?: unknown };

function describeFailure(error: unknown): { missing: boolean; error: string } {
  const shape = (error ?? {}) as StorageFailure;
  const statusCode = typeof shape.statusCode === "string" ? shape.statusCode : "";
  const message =
    typeof shape.message === "string" ? shape.message : "unknown storage error";

  // Storage answers `404` for an object that is gone and `403` for one the caller may not read; both
  // mean "there is nothing here for you", which is the answer the route gives.
  return { missing: statusCode === "404" || statusCode === "403", error: message };
}

/**
 * Mints a short-lived URL for one object, with the **request-scoped** client on purpose: the storage
 * policies of SCRUM-95 are what decide whether this caller may read that path (their own photo, or the
 * whole organization as a manager/owner). Nothing here is privileged.
 *
 * A missing object and a foreign path are not errors of the application — they are the normal "the
 * retention job removed it" / "not yours" answers, which is why they come back as `missing` and the
 * route maps them to `404` while a genuine storage outage becomes a `500`.
 */
export async function signAttendancePhoto(
  path: string,
): Promise<AttendancePhotoLink> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(ATTENDANCE_PHOTO_BUCKET)
    .createSignedUrl(path, ATTENDANCE_PHOTO_URL_TTL_SECONDS);

  if (error) {
    return { ok: false, ...describeFailure(error) };
  }

  if (!data?.signedUrl) {
    return { ok: false, missing: true, error: "storage returned no signed URL" };
  }

  return {
    ok: true,
    url: data.signedUrl,
    expiresAt: new Date(
      Date.now() + ATTENDANCE_PHOTO_URL_TTL_SECONDS * 1000,
    ).toISOString(),
  };
}
