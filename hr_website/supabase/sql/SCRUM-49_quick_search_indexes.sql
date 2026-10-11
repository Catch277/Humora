-- SCRUM-49: Trigram indexes for ILIKE quick search.
-- Assumes public.shifts has a searchable `name` column.

create extension if not exists pg_trgm;

create index if not exists users_full_name_trgm_idx
  on public.users using gin (full_name gin_trgm_ops);

create index if not exists requests_request_type_trgm_idx
  on public.requests using gin (request_type gin_trgm_ops);

create index if not exists requests_status_trgm_idx
  on public.requests using gin (status gin_trgm_ops);

create index if not exists shifts_name_trgm_idx
  on public.shifts using gin (name gin_trgm_ops);
