-- SCRUM-54: fix "stack depth limit exceeded" in the organization policies.
-- Run this script in Supabase Dashboard > SQL Editor. Run it **before** using the app again.
--
-- Symptom: every read of `public.users` fails with
--     Error: Unable to load user: stack depth limit exceeded
-- so the screens and endpoints that need a profile answer 500 (`/organization`,
-- `GET /api/auth/session`, the sidebar organization card), and the `/onboarding` redirect never
-- fires because `proxy.ts` reads the same row — which makes it look like the organization feature
-- is missing after login.
--
-- Cause: SCRUM-51 wrote the `users_select_authenticated` / `users_update_managers` policies in terms
-- of `public.current_organization_id()` and `public.is_organization_manager()`, and both helpers read
-- `public.users`. A policy on `users` that calls a function which reads `users` is self-referential,
-- and because the helpers were `security invoker` the policy also applied to the inner read: the
-- planner kept re-entering the policy until the stack blew. The same trap fires from the management
-- policies of the other tables, because they check the caller's role with a subquery on `users`.
--
-- Fix: make both helpers `security definer`. They then read `public.users` as their owner (a table
-- owner bypasses RLS by default), so the chain stops after one hop instead of recursing. This is
-- safe because each helper only ever answers about the *caller*:
--   * `current_organization_id()` filters `where id = auth.uid()`;
--   * `is_organization_manager()` does the same and returns a boolean.
-- Both keep `set search_path = public`, so the definer context cannot be redirected to another schema
-- (the usual hardening for definer functions).

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid()
$$;

create or replace function public.is_organization_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and upper(coalesce(u.role, '')) in ('OWNER', 'CHU')
  )
$$;

-- `create or replace` keeps existing grants; restated so a half-applied database cannot leave the
-- helpers unreachable.
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_organization_manager() to authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- Run these three while signed in as a real account. Before the fix the first two raise
-- "stack depth limit exceeded"; after it they must answer normally (null is a valid answer while the
-- account belongs to no organization).
--
--   select public.current_organization_id();
--   select public.is_organization_manager();
--   select id, role, organization_id, must_change_password
--   from public.users
--   where id = auth.uid();

-- If the first query still raises the error, the role that executed this script is not the owner of
-- `public.users` (a table owner bypasses RLS, which is what stops the recursion). In Supabase the
-- SQL Editor runs as `postgres`, which owns the table, so this should not happen; if it does, check
-- that the functions were actually replaced:
--
--   select proname, prosecdef, pg_get_functiondef(oid)
--   from pg_proc
--   where proname in ('current_organization_id', 'is_organization_manager');
--
-- `prosecdef` must be true for both.