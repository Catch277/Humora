-- SCRUM-41: Đơn từ + duyệt đơn (the real `requests` table behind GET /api/requests and
-- PATCH /api/requests/{id}/review).
-- Run this script in Supabase Dashboard > SQL Editor.
--
-- `public.requests` was created by hand in the dashboard (quick search already reads it), so
-- every statement is defensive: the table is created only when missing and the columns are
-- added only when absent. The column list was verified against PostgREST before writing this
-- script: id, branch_id, user_id, request_type, title, content, status, reject_reason,
-- approver_id, created_at, updated_at.
--
-- Until this script is applied the review endpoint has no table-level protection: the route
-- checks the OWNER/CHU role in the use case, and the RLS policies below repeat that check in
-- the database so a direct PostgREST call is refused too.

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete set null,
  user_id uuid,
  request_type text not null,
  title text,
  content text,
  status text not null default 'PENDING',
  reject_reason text,
  approver_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requests add column if not exists branch_id uuid;
alter table public.requests add column if not exists user_id uuid;
alter table public.requests add column if not exists request_type text;
alter table public.requests add column if not exists title text;
alter table public.requests add column if not exists content text;
alter table public.requests add column if not exists status text not null default 'PENDING';
alter table public.requests add column if not exists reject_reason text;
alter table public.requests add column if not exists approver_id uuid;
alter table public.requests add column if not exists created_at timestamptz not null default now();
alter table public.requests add column if not exists updated_at timestamptz not null default now();

-- The repository embeds `requester:users (id, full_name)`, and PostgREST can only resolve that
-- relationship through a real foreign key. `not valid` enforces every future row without
-- re-checking rows that predate the `users` rows (and without failing when such a row exists).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'requests_user_id_fkey'
      and conrelid = 'public.requests'::regclass
  ) then
    alter table public.requests
      add constraint requests_user_id_fkey
      foreign key (user_id) references public.users (id) on delete cascade not valid;
  end if;
end $$;

-- Values mirror the review flow in lib/usecases/ReviewRequestUseCase.ts. `not valid` so a
-- legacy status on an old row cannot make the migration fail.
alter table public.requests drop constraint if exists requests_status_check;
alter table public.requests add constraint requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED')) not valid;

-- The queue is read by status and by branch; `user_id` serves "đơn của tôi".
create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_branch_id_idx on public.requests (branch_id);
create index if not exists requests_user_id_idx on public.requests (user_id);
create index if not exists requests_updated_at_idx on public.requests (updated_at desc);

alter table public.requests enable row level security;

-- Every signed-in account may read the queue (quick search already exposes request rows), while
-- approving or rejecting needs the OWNER / CHU role — the same gate as branches, facilities and
-- the schedule, and the database-side twin of RequestReviewForbiddenError.
drop policy if exists requests_select_authenticated on public.requests;
create policy requests_select_authenticated on public.requests
  for select
  to authenticated
  using (true);

drop policy if exists requests_insert_own on public.requests;
create policy requests_insert_own on public.requests
  for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'PENDING');

drop policy if exists requests_update_managers on public.requests;
create policy requests_update_managers on public.requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and upper(u.role) in ('OWNER', 'CHU')
    )
  );
