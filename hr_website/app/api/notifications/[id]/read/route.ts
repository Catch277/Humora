/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     description: Sets is_read to true for the specified notification owned by the authenticated user.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The notification UUID.
 *     responses:
 *       200:
 *         description: Notification marked as read.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: The ID is not a valid UUID.
 *       401:
 *         description: Authentication is required.
 *       404:
 *         description: The notification was not found or does not belong to the user.
 *       500:
 *         description: An unexpected server error occurred.
 */
import { NextResponse } from "next/server";

import { NotificationNotFoundError } from "@/lib/domain/errors/NotificationNotFoundError";
import { SupabaseNotificationRepository } from "@/lib/infrastructure/repositories/SupabaseNotificationRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { MarkNotificationReadUseCase } from "@/lib/usecases/MarkNotificationReadUseCase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "id must be a UUID." }, { status: 400 });
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

    const markRead = new MarkNotificationReadUseCase(
      new SupabaseNotificationRepository(),
    );
    await markRead.execute(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof NotificationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to mark notification as read", error);
    return NextResponse.json(
      { error: "Unable to mark notification as read." },
      { status: 500 },
    );
  }
}
