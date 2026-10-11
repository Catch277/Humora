-- SCRUM-62: reconcile `requests_request_type_check` with the app's vocabulary.
-- Run this script in Supabase Dashboard > SQL Editor and **read the Messages tab**: it prints the
-- definition it replaces before dropping it.
--
-- Why this exists: `public.requests` was created by hand in the dashboard before any ticket (see the
-- SCRUM-41 header), so it carries a CHECK constraint whose values this app cannot read — PostgREST
-- exposes columns and foreign keys, never a check definition, and the root OpenAPI needs a secret key.
-- The app's `REQUEST_TYPES` (`lib/domain/entities/RequestEntity.ts`) are the four đơn the chain files,
-- and until the constraint accepts them every `POST /api/requests` dies with
--
--   23514 new row for relation "requests" violates check constraint "requests_request_type_check"
--
-- which the route can only answer with a generic `500` (it is a schema mismatch, not a bad payload).
--
-- The four values below are the ones the review screen, its preset reject reasons and quick search
-- already speak. `request_type` is stored *verbatim* and displayed as-is, so this list and
-- `REQUEST_TYPES` must stay identical: if your project used machine codes (`LEAVE`, `SHIFT_SWAP`, ...)
-- and you would rather keep them, extend the `in (...)` list here **and** change `REQUEST_TYPES` to
-- match — the app never translates the column.

do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conname = 'requests_request_type_check'
    and conrelid = 'public.requests'::regclass;

  if v_definition is null then
    raise notice 'SCRUM-62: requests_request_type_check does not exist — nothing to replace.';
  else
    raise notice 'SCRUM-62: replacing the existing constraint: %', v_definition;
  end if;
end $$;

alter table public.requests drop constraint if exists requests_request_type_check;
alter table public.requests add constraint requests_request_type_check
  check (request_type in ('Nghỉ phép', 'Đổi ca', 'Điều chỉnh công', 'Khác')) not valid;

-- `not valid` skips rows written before this script (there is normally nothing to skip) while still
-- enforcing the list on every new row. Uncomment the line below to also validate the old rows; it
-- fails loudly and names the offending row if a legacy value is outside the list, and it is safe to
-- leave unvalidated — a NOT VALID constraint is enforced for every insert and update.
-- alter table public.requests validate constraint requests_request_type_check;

-- ── Verify ───────────────────────────────────────────────────────────────────────────────
-- 1. The constraint is the one the app expects. `convalidated = false` is fine (see the note above).
select conname, pg_get_constraintdef(oid) as definition, convalidated
from pg_constraint
where conrelid = 'public.requests'::regclass
  and conname = 'requests_request_type_check';

-- 2. The values in the table (must be empty, or a subset of the new list).
select request_type, count(*) as rows
from public.requests
group by request_type
order by request_type;

-- ── After running this ───────────────────────────────────────────────────────────────────
-- `POST /api/requests` answers `201` instead of `500`, and the đơn it stores shows up on `/requests`
-- as `Chờ duyệt` for the branch head (hoặc chủ sở hữu) to approve.
