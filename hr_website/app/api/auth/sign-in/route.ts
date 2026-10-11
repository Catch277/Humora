/**
 * @swagger
 * /api/auth/sign-in:
 *   post:
 *     summary: Sign in with email and password
 *     description: Exchanges email/password credentials for a Supabase Auth session and writes the session cookies onto the response.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: hr.lead@humora.vn
 *               password:
 *                 type: string
 *                 format: password
 *                 example: CorrectHorseBatteryStaple
 *     responses:
 *       200:
 *         description: The session was created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSession'
 *       400:
 *         description: The JSON body is invalid, or email/password is missing.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: The email or password is incorrect.
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

import { InvalidCredentialsError } from "@/lib/domain/errors/InvalidCredentialsError";
import { SupabaseAuthService } from "@/lib/infrastructure/SupabaseAuthService";
import { SignInUseCase } from "@/lib/usecases/SignInUseCase";

type SignInRequest = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  let body: SignInRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json(
      { error: "email and password must be strings." },
      { status: 400 },
    );
  }

  try {
    const signIn = new SignInUseCase(new SupabaseAuthService());
    const session = await signIn.execute({
      email: body.email,
      password: body.password,
    });

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith("email must")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message.startsWith("password is")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to sign in", error);
    return NextResponse.json(
      { error: "Unable to sign in." },
      { status: 500 },
    );
  }
}
