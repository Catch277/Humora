/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get notifications for the authenticated user
 *     description: Returns a paginated list of notifications for the current user, sorted newest first.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (1-indexed).
 *       - in: query
 *         name: page_size
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page.
 *       - in: query
 *         name: unread
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: |
 *           Set to `true` to return and count only unread notifications. The header uses
 *           `unread=true&page_size=1` so `total` is the exact unread count for its badge.
 *       - in: query
 *         name: read
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: |
 *           Set to `true` to return and count only the notifications already read (the "Đã đọc" tab of
 *           `/notifications`). Mutually exclusive with `unread=true`.
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: |
 *           A comma-separated list of notification codes to include, e.g.
 *           `type=REQUEST_CREATED,REQUEST_APPROVED`. `/notifications` sends a whole category this way
 *           (its chips expand through `notificationTypesOfCategory`) so the filter, the total and the
 *           pagination all describe the same rows. An unknown code answers `400`.
 *     responses:
 *       200:
 *         description: A paginated list of notifications.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedNotifications'
 *       400:
 *         description: A query parameter is invalid (a non-positive page size or an unknown `type`).
 *       401:
 *         description: Bạn cần đăng nhập để thực hiện thao tác này.
 *       500:
 *         description: An unexpected server error occurred.
 */
import { type NextRequest, NextResponse } from "next/server";

import { parseNotificationTypes } from "@/app/api/notifications/_lib/notificationTypeFilter";
import { SupabaseNotificationRepository } from "@/lib/infrastructure/repositories/SupabaseNotificationRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { GetUserNotificationsUseCase } from "@/lib/usecases/GetUserNotificationsUseCase";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Bạn cần đăng nhập để thực hiện thao tác này." },
        { status: 401 },
      );
    }

    const pageParam = request.nextUrl.searchParams.get("page");
    const pageSizeParam = request.nextUrl.searchParams.get("page_size");

    const page = pageParam ? parseInt(pageParam, 10) : DEFAULT_PAGE;
    const pageSize = pageSizeParam
      ? parseInt(pageSizeParam, 10)
      : DEFAULT_PAGE_SIZE;

    if (isNaN(page) || page < 1 || isNaN(pageSize) || pageSize < 1) {
      return NextResponse.json(
        { error: "page và page_size phải là số nguyên dương." },
        { status: 400 },
      );
    }

    const clampedPageSize = Math.min(pageSize, MAX_PAGE_SIZE);

    const unreadParam = request.nextUrl.searchParams.get("unread");
    const readParam = request.nextUrl.searchParams.get("read");

    if (
      unreadParam !== null &&
      unreadParam !== "true" &&
      unreadParam !== "false"
    ) {
      return NextResponse.json(
        { error: "unread phải là true hoặc false." },
        { status: 400 },
      );
    }

    if (
      readParam !== null &&
      readParam !== "true" &&
      readParam !== "false"
    ) {
      return NextResponse.json(
        { error: "read phải là true hoặc false." },
        { status: 400 },
      );
    }

    if (unreadParam === "true" && readParam === "true") {
      return NextResponse.json(
        { error: "unread và read không thể cùng bằng true." },
        { status: 400 },
      );
    }

    const parsedTypes = parseNotificationTypes(
      request.nextUrl.searchParams.get("type"),
    );

    if (!parsedTypes.ok) {
      return NextResponse.json({ error: parsedTypes.error }, { status: 400 });
    }

    const getNotifications = new GetUserNotificationsUseCase(
      new SupabaseNotificationRepository(),
    );
    const result = await getNotifications.execute(
      user.id,
      page,
      clampedPageSize,
      {
        unreadOnly: unreadParam === "true",
        readOnly: readParam === "true",
        types: parsedTypes.types,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get notifications", error);
    return NextResponse.json(
      { error: "Không thể tải thông báo." },
      { status: 500 },
    );
  }
}
