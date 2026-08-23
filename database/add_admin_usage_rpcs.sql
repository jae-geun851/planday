-- 14-2차시: 관리자 사용량 조회 RPC
-- Supabase SQL Editor → Run (create_admin_roles.sql, add_role_to_user_profiles.sql 이후)

-- ── 사용자별 월간 사용량 ─────────────────────────────────────
create or replace function public.admin_usage_by_user(p_month_start date default null)
returns table (
  user_id uuid,
  email text,
  nickname text,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  estimated_cost_usd numeric,
  api_call_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_start date := coalesce(p_month_start, date_trunc('month', now() at time zone 'Asia/Seoul')::date);
  v_end date := (v_start + interval '1 month')::date;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  return query
  select
    p.user_id,
    u.email::text,
    p.nickname,
    coalesce(sum(l.input_tokens), 0)::bigint,
    coalesce(sum(l.output_tokens), 0)::bigint,
    coalesce(sum(l.total_tokens), 0)::bigint,
    coalesce(sum(l.estimated_cost_usd), 0)::numeric,
    count(l.id)::bigint
  from public.user_profiles p
  join auth.users u on u.id = p.user_id
  left join public.api_usage_logs l
    on l.user_id = p.user_id
    and (l.created_at at time zone 'Asia/Seoul')::date >= v_start
    and (l.created_at at time zone 'Asia/Seoul')::date < v_end
  group by p.user_id, u.email, p.nickname
  order by coalesce(sum(l.total_tokens), 0) desc, u.email;
end;
$$;

revoke all on function public.admin_usage_by_user(date) from public;
grant execute on function public.admin_usage_by_user(date) to authenticated, service_role;

-- ── 일별 전체 사용량 (KST) ───────────────────────────────────
create or replace function public.admin_usage_daily_summary(p_month_start date default null)
returns table (
  usage_date date,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  estimated_cost_usd numeric,
  api_call_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := coalesce(p_month_start, date_trunc('month', now() at time zone 'Asia/Seoul')::date);
  v_end date := (v_start + interval '1 month')::date;
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  return query
  select
    d.usage_date,
    coalesce(sum(d.input_tokens), 0)::bigint,
    coalesce(sum(d.output_tokens), 0)::bigint,
    coalesce(sum(d.total_tokens), 0)::bigint,
    coalesce(sum(d.estimated_cost_usd), 0)::numeric,
    coalesce(sum(d.api_call_count), 0)::bigint
  from public.api_usage_daily d
  where d.usage_date >= v_start and d.usage_date < v_end
  group by d.usage_date
  order by d.usage_date desc;
end;
$$;

revoke all on function public.admin_usage_daily_summary(date) from public;
grant execute on function public.admin_usage_daily_summary(date) to authenticated, service_role;
