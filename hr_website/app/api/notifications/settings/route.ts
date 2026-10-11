/**
 * @swagger
 * /api/notifications/settings:
 *   get:
 *     summary: Get notification settings for the authenticated user
 *     description: Returns the notification channel preferences for the current user.
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: The user's notification settings.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NotificationSetting'
 *       401:
 *         description: Authentication is required.
 *       500:
 *         description: An unexpected server error occurred.
 *   put:
 *     summary: Update notification settings for the authenticated user
 *     description: Creates or updates notification channel preferences. Uses upsert on (user_id, channel).
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - settings
 *             properties:
 *               settings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - channel
 *                     - enabled
 *                   properties:
 *                     channel:
 *                       type: string
 *                       description: 'Notification channel name (e.g. "email", "push", "in_app").'
 *                     enabled:
 *                       type: boolean
 *                       description: Whether this channel is enabled.
 *     responses:
 *       200:
 *         description: The updated notification settings.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NotificationSetting'
 *       400:
 *         description: The request body is invalid.
 *       401:
 *         description: Authentication is required.
 *       500:
 *         description: An unexpected server error occurred.
 */
import { NextResponse } from "next/server";

import { SupabaseNotificationRepository } from "@/lib/infrastructure/repositories/SupabaseNotificationRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { GetNotificationSettingsUseCase } from "@/lib/usecases/GetNotificationSettingsUseCase";
import { UpdateNotificationSettingsUseCase } from "@/lib/usecases/UpdateNotificationSettingsUseCase";

type SettingsRequestBody = {
  settings?: unknown;
};

export async function GET() {
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

    const getSettings = new GetNotificationSettingsUseCase(
      new SupabaseNotificationRepository(),
    );
    const settings = await getSettings.execute(user.id);

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to get notification settings", error);
    return NextResponse.json(
      { error: "Unable to retrieve notification settings." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  let body: SettingsRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !Array.isArray(body.settings) ||
    body.settings.length === 0 ||
    !body.settings.every(
      (s: unknown) =>
        typeof s === "object" &&
        s !== null &&
        "channel" in s &&
        "enabled" in s &&
        typeof (s as { channel: unknown }).channel === "string" &&
        (s as { channel: string }).channel.trim() !== "" &&
        typeof (s as { enabled: unknown }).enabled === "boolean",
    )
  ) {
    return NextResponse.json(
      {
        error:
          "settings must be a non-empty array of { channel: string, enabled: boolean }.",
      },
      { status: 400 },
    );
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

    const updateSettings = new UpdateNotificationSettingsUseCase(
      new SupabaseNotificationRepository(),
    );
    const updated = await updateSettings.execute(
      user.id,
      body.settings as { channel: string; enabled: boolean }[],
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update notification settings", error);
    return NextResponse.json(
      { error: "Unable to update notification settings." },
      { status: 500 },
    );
  }
}
