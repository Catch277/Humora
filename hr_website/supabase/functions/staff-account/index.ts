// SCRUM-52: create (or re-set the password of) a staff account for one organization.
//
// This file is **Deno**, not Node/Next.js. The repository's `tsconfig.json` excludes
// `supabase/functions/**` from the app's `npx tsc --noEmit` on purpose, and `deno.json` next to it
// marks the folder as a Deno project. Two consequences worth knowing:
//
//   - an editor without the Deno extension treats this file as Node and reports
//     "Cannot find name 'Deno'" plus "Cannot find module 'jsr:@supabase/supabase-js@2'";
//     they are not real errors. Installing the Deno VS Code extension (or `deno check`) removes
//     them, because the folder then resolves as Deno.
//   - the app's lint/type gates do not cover this file; the Edge runtime bundles it at deploy, and
//     Deno is the authority for how it typechecks. Keep the code simple enough to review by eye.
//
// This is the only place in the whole stack that holds the service-role key, and it lives in
// Supabase's own secrets — never in the web app, which forwards the *caller's* access token and
// decides nothing. Because a service-role client bypasses RLS, the checks below are the entire
// authorization boundary and must stay:
//
//   1. verify the JWT (Edge Functions verify it before the handler runs; keep verify_jwt ON),
//   2. read the caller's own profile with the service client,
//   3. require that they belong to an organization and are its OWNER (SCRUM-59: handing out
//      accounts is the owner's decision; a MANAGER gets 403 here and from the route that calls us),
//   4. only ever touch accounts of that organization,
//   5. validate email/password here as well, and rate-limit per organization.
//
// Deploy by hand (there is no Supabase CLI in this repository):
//   Dashboard > Edge Functions > Create a new function named `staff-account` > paste this file.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided by Supabase.
// The web app calls it through POST /api/organizations/accounts (see EdgeFunctionStaffProvisioningService).

// `npm:@supabase/supabase-js@2` works on the same runtime if you prefer it; `jsr:` is what the
// Supabase templates use today and needs no npm resolution.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Kept in step with `lib/usecases/credentials.ts` in the web app. */
const MIN_PASSWORD_LENGTH = 8;
const MAX_FULL_NAME_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_ROLES = new Set(["EMPLOYEE", "MANAGER"]);

/** A runaway form (or a script) should not be able to mint accounts all night. */
const MAX_PROVISIONED_PER_HOUR = 20;

type Body = {
  action?: unknown;
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  role?: unknown;
  user_id?: unknown;
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { error: "Cần đặt SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong secrets của hàm." },
      500,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1/2/3: the caller must be a manager of an organization ──────────────────────────────
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (!token) {
    return json({ error: "Bạn cần đăng nhập để thực hiện thao tác này." }, 401);
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);

  if (authError || !authData.user) {
    return json({ error: "Bạn cần đăng nhập để thực hiện thao tác này." }, 401);
  }

  const callerId = authData.user.id;

  const { data: caller, error: callerError } = await admin
    .from("users")
    .select("role, organization_id")
    .eq("id", callerId)
    .maybeSingle();

  if (callerError) {
    return json({ error: `Không thể đọc hồ sơ người gọi: ${callerError.message}` }, 500);
  }

  if (!caller) {
    return json({ error: "Tài khoản chưa có hồ sơ người dùng." }, 403);
  }

  const callerRole = String(caller.role ?? "").toUpperCase();
  const organizationId = (caller.organization_id as string | null) ?? null;

  if (!organizationId) {
    return json({ error: "Tài khoản này chưa thuộc tổ chức nào." }, 403);
  }

  if (callerRole !== "OWNER") {
    return json(
      { error: "Chỉ chủ sở hữu tổ chức mới quản lý được tài khoản nhân viên." },
      403,
    );
  }

  // Health probe for GET /api/organizations/accounts (the screen hides the form when the function
  // is not deployed yet instead of offering a button that always fails).
  if (request.method === "GET") {
    return json({ status: "ok", function: "staff-account" }, 200);
  }

  if (request.method !== "POST") {
    return json({ error: "Phương thức không được hỗ trợ." }, 405);
  }

  let body: Body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Nội dung yêu cầu phải là JSON hợp lệ." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "create";

  if (action === "reset_password") {
    return await resetPassword(admin, body, organizationId);
  }

  if (action !== "create") {
    return json({ error: "`action` phải là `create` hoặc `reset_password`." }, 400);
  }

  return await createAccount(admin, body, { callerId, organizationId });
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseAdmin = ReturnType<typeof createClient>;

/** Same wording the web app uses, so both layers answer a bad field identically. */
function fieldError(
  body: Body,
): { email: string; password: string; fullName: string; role: string } | Response {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const rawRole = typeof body.role === "string" ? body.role.toUpperCase() : "EMPLOYEE";
  // SCRUM-59 renamed `CHU` to `MANAGER`. The old spelling is still accepted so that a call queued
  // before the rename does not fail, but the row is always written in the new vocabulary — which is
  // what `organization_invites_role_check` accepts once `SCRUM-59_role_model.sql` has been applied.
  const role = rawRole === "CHU" ? "MANAGER" : rawRole;

  if (!EMAIL_PATTERN.test(email) || email.length > 160) {
    return json({ error: "Email không hợp lệ." }, 422);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` },
      422,
    );
  }

  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    return json(
      { error: `Họ tên tối đa ${MAX_FULL_NAME_LENGTH} ký tự.` },
      422,
    );
  }

  if (!INVITE_ROLES.has(role)) {
    return json({ error: "Vai trò phải là EMPLOYEE (nhân viên) hoặc MANAGER (quản lý chi nhánh)." }, 422);
  }

  return { email, password, fullName, role };
}

async function createAccount(
  admin: SupabaseAdmin,
  body: Body,
  caller: { callerId: string; organizationId: string },
): Promise<Response> {
  const fields = fieldError(body);

  if (fields instanceof Response) {
    return fields;
  }

  const { email, password, fullName, role } = fields;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("organization_invites")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", caller.organizationId)
    .eq("source", "provisioned")
    .gte("created_at", since);

  if (countError) {
    return json({ error: `Không thể kiểm tra giới hạn tạo tài khoản: ${countError.message}` }, 500);
  }

  if ((count ?? 0) >= MAX_PROVISIONED_PER_HOUR) {
    return json(
      { error: "Tổ chức đã tạo quá nhiều tài khoản trong một giờ qua. Vui lòng thử lại sau." },
      429,
    );
  }

  // Compare on the stored lower-case value: the join RPC matches against exactly that.
  const { data: existing, error: existingError } = await admin
    .from("organization_invites")
    .select("id, claimed_by")
    .eq("organization_id", caller.organizationId)
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    return json({ error: `Không thể đọc danh sách chờ: ${existingError.message}` }, 500);
  }

  if (existing?.claimed_by) {
    return json(
      { error: "Tài khoản này đã là thành viên của tổ chức." },
      409,
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // The owner hands the temporary password over in person; no mailbox is in the loop.
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split("@")[0] },
  });

  if (createError || !created.user) {
    const message = createError?.message ?? "unknown error";

    if (/exist|registered/i.test(message)) {
      return json({ error: "Email này đã có tài khoản đăng nhập." }, 409);
    }

    return json({ error: `Không thể tạo tài khoản: ${message}` }, 500);
  }

  const userId = created.user.id;

  // The SCRUM-50 trigger creates the profile row; without it the account would exist in Auth but
  // have no `public.users` row, which every RLS policy and /api/auth/session depends on. Fail loudly
  // instead of handing the owner a login that cannot see anything.
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return json({ error: `Không thể đọc hồ sơ vừa tạo: ${profileError.message}` }, 500);
  }

  if (!profile) {
    return json(
      {
        error:
          "Tài khoản đã được tạo nhưng không có dòng hồ sơ: trigger `on_auth_user_created` của SCRUM-50_user_registration.sql chưa được cài. Hãy chạy script đó, xóa tài khoản auth còn sót rồi tạo lại.",
      },
      500,
    );
  }

  // The account chooses its own password before the app opens, so the flag is set here.
  const { error: flagError } = await admin
    .from("users")
    .update({ must_change_password: true })
    .eq("id", userId);

  if (flagError) {
    return json({ error: `Không thể đặt cờ đổi mật khẩu: ${flagError.message}` }, 500);
  }

  if (existing) {
    const { error: updateError } = await admin
      .from("organization_invites")
      .update({
        full_name: fullName || null,
        role,
        source: "provisioned",
        invited_by: caller.callerId,
      })
      .eq("id", existing.id);

    if (updateError) {
      return json({ error: `Không thể cập nhật danh sách chờ: ${updateError.message}` }, 500);
    }
  } else {
    const { error: insertError } = await admin.from("organization_invites").insert({
      organization_id: caller.organizationId,
      email,
      full_name: fullName || null,
      role,
      source: "provisioned",
      invited_by: caller.callerId,
    });

    if (insertError) {
      return json(
        { error: `Không thể thêm tài khoản vào danh sách chờ: ${insertError.message}` },
        500,
      );
    }
  }

  return json({ user_id: userId, email, must_change_password: true }, 201);
}

async function resetPassword(
  admin: SupabaseAdmin,
  body: Body,
  organizationId: string,
): Promise<Response> {
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!UUID_PATTERN.test(userId)) {
    return json({ error: "`user_id` phải là UUID." }, 422);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` },
      422,
    );
  }

  // Without this check the service client would reset anybody's password.
  const { data: target, error: targetError } = await admin
    .from("users")
    .select("id, organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    return json({ error: `Không thể đọc tài khoản: ${targetError.message}` }, 500);
  }

  if (!target || target.organization_id !== organizationId) {
    return json({ error: "Tài khoản đó không thuộc tổ chức của bạn." }, 403);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password,
  });

  if (updateError) {
    return json({ error: `Không thể đặt lại mật khẩu: ${updateError.message}` }, 500);
  }

  const { error: flagError } = await admin
    .from("users")
    .update({ must_change_password: true })
    .eq("id", userId);

  if (flagError) {
    return json({ error: `Không thể đặt cờ đổi mật khẩu: ${flagError.message}` }, 500);
  }

  return json({ user_id: userId, must_change_password: true }, 200);
}
