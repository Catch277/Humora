import { isNotificationType } from "@/lib/domain/notificationCatalog";

/**
 * The `types` filter, shared by the two handlers that accept it (`GET /api/notifications` in the
 * query string, `POST /api/notifications/read-all` in the body) so the two cannot drift apart — the
 * shape the private `app/api/branches/_lib/branchRequest.ts` folder exists for.
 *
 * A code the catalog does not know is a `400`, never a silently empty list: the value comes from a
 * category chip on `/notifications`, and a typo would otherwise read as "no notifications".
 */
export type ParsedNotificationTypes =
  | { ok: true; types?: string[] }
  | { ok: false; error: string };

export function parseNotificationTypes(value: unknown): ParsedNotificationTypes {
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }

  let codes: string[];

  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === "string")) {
      return { ok: false, error: "types must be an array of strings." };
    }

    codes = value.map((entry) => (entry as string).trim());
  } else if (typeof value === "string") {
    // The query string carries `?type=A,B`, because a chip stands for a whole category.
    codes = value.split(",").map((entry) => entry.trim());
  } else {
    return { ok: false, error: "types must be a comma-separated string or an array." };
  }

  codes = [...new Set(codes.filter((code) => code !== ""))];

  if (codes.length === 0) {
    return { ok: true };
  }

  const unknown = codes.filter((code) => !isNotificationType(code));

  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown notification type(s): ${unknown.join(", ")}.`,
    };
  }

  return { ok: true, types: codes };
}