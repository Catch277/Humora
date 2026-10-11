/**
 * @swagger
 * /api/auth/sign-out:
 *   post:
 *     summary: Sign out the current session
 *     description: Clears the Supabase Auth session cookies. Safe to call without an active session.
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: The session was cleared.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - success
 *               properties:
 *                 success:
 *                   type: boolean
 *       500:
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
import { NextResponse } from "next/server";

import { SupabaseAuthService } from "@/lib/infrastructure/SupabaseAuthService";
import { SignOutUseCase } from "@/lib/usecases/SignOutUseCase";

export async function POST() {
  try {
    const signOut = new SignOutUseCase(new SupabaseAuthService());
    await signOut.execute();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to sign out", error);
    return NextResponse.json(
      { error: "Unable to sign out." },
      { status: 500 },
    );
  }
}
