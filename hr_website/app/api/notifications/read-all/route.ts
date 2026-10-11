/**
 * @swagger
 * /api/notifications/read-all:
 *   post:
 *     summary: Mark every notification of the caller as read
 *     description: |
 *       SCRUM-70. Marks the caller's unread notifications as read in a single statement, optionally
 *       narrowed to a set of codes (`types`) so "mark this group as read" matches the chip the user
 *       is looking at. RLS (`notifications_update_own`) keeps the statement inside the caller's own
 *       rows; the response reports how many actually moved.
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               types:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: |
 *                   Optional whitelist of notification codes (`REQUEST_CREATED`, …). Omitted means
 *                   every unread notification of the caller.
 *     responses:
 *       200:
 *         description: How many notifications were marked as read.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [updated]
 *               properties:
 *                 updated:
 *                   type: integer
 *                   example: 6
 *       400:
 *         description: The JSON body is invalid, or `types` names a code the catalog does not know.
 *       401:
 *         description: Authentication is required.
 *       500:
 *         description: An unexpected server error occurred.
 */
import { NextResponse } from "next/server";

import { parseNotificationTypes } from "@/app/api/notifications/_lib/notificationTypeFilter";
import { SupabaseNotificationRepository } from "@/lib/infrastructure/repositories/SupabaseNotificationRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { MarkAllNotificationsReadUseCase } from "@/lib/usecases/MarkAllNotificationsReadUseCase";

export async function POST(request: Request) {
  let body: { types?: unknown } = {};

  // The body is optional ("mark everything"), so an empty request is valid; only malformed JSON is
  // a `400`.
  const raw = await request.text();

  if (raw.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(raw);

      if (typeof parsed !== "object" || parsed === null) {
        return NextResponse.json(
          { error: "The body must be a JSON object." },
          { status: 400 },
        );
      }

      body = parsed as { types?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
  }

  const parsedTypes = parseNotificationTypes(body.types);

  if (!parsedTypes.ok) {
    return NextResponse.json({ error: parsedTypes.error }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const markAllRead = new MarkAllNotificationsReadUseCase(
      new SupabaseNotificationRepository(),
    );
    const updated = await markAllRead.execute(user.id, parsedTypes.types);

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("Failed to mark all notifications as read", error);
    return NextResponse.json(
      { error: "Unable to mark notifications as read." },
      { status: 500 },
    );
  }
}