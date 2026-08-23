-- 13-1차시: 관리자 역할 · 권한 기반 (마일스톤)
-- Supabase SQL Editor → New query → Run
-- ⚠️ 최초 관리자 지정은 아래 「최초 관리자 등록」 주석을 참고하세요.

-- ── 관리자 계정 테이블 ─────────────────────────────────────────
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin'
    check (role in ('admin', 'super_admin')),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists admin_users_role_idx on public.admin_users(role);

-- ── 관리자 여부 확인 (RLS·RPC에서 사용) ───────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- ── 권한 ─────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.admin_users to authenticated, service_role;
grant all on table public.admin_users to service_role;

-- ── RLS: admin_users ─────────────────────────────────────────
alter table public.admin_users enable row level security;

drop policy if exists "Users read own admin row" on public.admin_users;
create policy "Users read own admin row"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- 클라이언트에서 관리자 추가/삭제는 막음 (SQL Editor 또는 service_role만)
-- super_admin UI는 이후 차시에서 Edge Function 등으로 구현

-- ── 관리자용 읽기 정책 (기존 테이블) ─────────────────────────
-- user_profiles
drop policy if exists "Admins read all profiles" on public.user_profiles;
create policy "Admins read all profiles"
  on public.user_profiles
  for select
  to authenticated
  using (public.is_admin());

-- conversation_records
drop policy if exists "Admins read all conversations" on public.conversation_records;
create policy "Admins read all conversations"
  on public.conversation_records
  for select
  to authenticated
  using (public.is_admin());

-- user_policy_consents
drop policy if exists "Admins read all consents" on public.user_policy_consents;
create policy "Admins read all consents"
  on public.user_policy_consents
  for select
  to authenticated
  using (public.is_admin());

-- api_usage_logs / api_usage_daily
drop policy if exists "Admins read all usage logs" on public.api_usage_logs;
create policy "Admins read all usage logs"
  on public.api_usage_logs
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins read all daily usage" on public.api_usage_daily;
create policy "Admins read all daily usage"
  on public.api_usage_daily
  for select
  to authenticated
  using (public.is_admin());

-- events (일정)
drop policy if exists "Admins read all events" on public.events;
create policy "Admins read all events"
  on public.events
  for select
  to authenticated
  using (public.is_admin());

-- ── 관리자 대시보드용 RPC (이메일 포함 사용자 목록) ───────────
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  nickname text,
  phone text,
  profile_completed boolean,
  joined_at timestamptz,
  profile_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required';
  end if;

  return query
  select
    p.user_id,
    u.email::text,
    p.nickname,
    p.phone,
    p.profile_completed,
    u.created_at as joined_at,
    p.updated_at as profile_updated_at
  from public.user_profiles p
  join auth.users u on u.id = p.user_id
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated, service_role;

-- ── 관리자용 전체 API 비용 요약 ───────────────────────────────
create or replace function public.admin_usage_totals(p_month_start date default null)
returns table (
  user_count bigint,
  total_calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  estimated_cost_usd numeric
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
    count(distinct l.user_id)::bigint,
    count(*)::bigint,
    coalesce(sum(l.input_tokens), 0)::bigint,
    coalesce(sum(l.output_tokens), 0)::bigint,
    coalesce(sum(l.total_tokens), 0)::bigint,
    coalesce(sum(l.estimated_cost_usd), 0)::numeric
  from public.api_usage_logs l
  where (l.created_at at time zone 'Asia/Seoul')::date >= v_start
    and (l.created_at at time zone 'Asia/Seoul')::date < v_end;
end;
$$;

revoke all on function public.admin_usage_totals(date) from public;
grant execute on function public.admin_usage_totals(date) to authenticated, service_role;

-- ── 최초 관리자 등록 (본인 UUID로 1회 실행) ─────────────────
-- 1) Authentication → Users 에서 관리자로 쓸 계정의 UUID 복사
-- 2) 아래 insert 의 YOUR-USER-UUID 를 바꿔 실행:
--
-- insert into public.admin_users (user_id, role, note)
-- values ('YOUR-USER-UUID', 'super_admin', '최초 관리자')
-- on conflict (user_id) do nothing;
