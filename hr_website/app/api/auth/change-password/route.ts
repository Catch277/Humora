/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change the signed-in account's password
 *     description: |
 *       SCRUM-52: replaces the caller's password through Supabase Auth with their own session (no
 *       service role) and clears the `must_change_password` flag that `proxy.ts` reads. This is how
 *       an account an owner created with a temporary password becomes a normal account.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: The password was changed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: The JSON body is invalid, or the password is shorter than 8 characters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabaseAuthService } from "@/lib/infrastructure/SupabaseAuthService";
import { SupabaseUserRepository } from "@/lib/infrastructure/repositories/SupabaseUserRepository";
import { createSupabaseServerClient } from "@/lib/infrastructure/supabaseClient";
import { ChangePasswordUseCase } from "@/lib/usecases/ChangePasswordUseCase";

export async function POST(request: Request) {
  let body: { password?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.password !== "string") {
    return NextResponse.json(
      { error: "password is required and must be a string." },
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

    const changePassword = new ChangePasswordUseCase(
      new SupabaseAuthService(),
      new SupabaseUserRepository(),
    );
    await changePassword.execute({ password: body.password });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("password must")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to change password", error);
    return NextResponse.json(
      { error: "Unable to change the password." },
      { status: 500 },
    );
  }
}