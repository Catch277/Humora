-- SCRUM-44: Aggregated revenue report RPC.
-- Run this after SCRUM-39_daily_revenue.sql and SCRUM-40_update_revenue.sql.

create or replace function public.get_revenue_report(
  p_branch_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_bucket text
)
returns table (
  bucket_start timestamptz,
  total_open_amount numeric,
  total_close_amount numeric,
  total_revenue_amount numeric,
  record_count bigint
)
language plpgsql
stable
set search_path = public
as $$
begin
  if p_bucket not in ('day', 'month') then
    raise exception 'Unsupported report bucket: %', p_bucket;
  end if;

  return query
  select
    (
      date_trunc(p_bucket, dr.created_at at time zone 'Asia/Bangkok')
      at time zone 'Asia/Bangkok'
    ) as bucket_start,
    sum(dr.open_amount) as total_open_amount,
    sum(dr.close_amount) as total_close_amount,
    sum(dr.close_amount - dr.open_amount) as total_revenue_amount,
    count(*) as record_count
  from public.daily_revenue dr
  where dr.created_at >= p_start_at
    and dr.created_at < p_end_at
    and dr.close_amount is not null
    and (p_branch_id is null or dr.branch_id = p_branch_id)
  group by 1
  order by 1;
end;
$$;
