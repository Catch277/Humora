/**
 * @swagger
 * /api/auth/sign-up:
 *   post:
 *     summary: Create an internal account
 *     description: Creates a Supabase Auth account and, through the SCRUM-50 `on_auth_user_created` trigger, the matching `public.users` profile with the default role `EMPLOYEE`. When the Supabase project requires email confirmation, no session is created and the response says so.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthSignUpRequest'
 *     responses:
 *       201:
 *         description: The account was created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSignUpResult'
 *       400:
 *         description: The JSON body is invalid, or email/password/full_name failed validation.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: An account already exists for this email address.
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

import { EmailAlreadyRegisteredError } from "@/lib/domain/errors/EmailAlreadyRegisteredError";
import { SupabaseAuthService } from "@/lib/infrastructure/SupabaseAuthService";
import { SignUpUseCase } from "@/lib/usecases/SignUpUseCase";

type SignUpRequest = {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
};

/** Message prefixes `SignUpUseCase` produces for field-level validation failures. */
const VALIDATION_PREFIXES = ["email must", "password must", "full_name must"];

export async function POST(request: Request) {
  let body: SignUpRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    typeof body.full_name !== "string"
  ) {
    return NextResponse.json(
      { error: "email, password and full_name must be strings." },
      { status: 400 },
    );
  }

  try {
    const signUp = new SignUpUseCase(new SupabaseAuthService());
    const result = await signUp.execute({
      email: body.email,
      password: body.password,
      // The HTTP boundary uses the `users` column name; the use case takes camelCase.
      fullName: body.full_name,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (
      error instanceof Error &&
      VALIDATION_PREFIXES.some((prefix) => error.message.startsWith(prefix))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to sign up", error);
    return NextResponse.json(
      { error: "Unable to create the account." },
      { status: 500 },
    );
  }
}
