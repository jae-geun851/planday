-- 14-1차시: user_profiles.role + is_admin() 확장
-- Supabase SQL Editor → New query → Run
-- (13-1 create_admin_roles.sql 실행 후)

-- ── 프로필에 역할 컬럼 ───────────────────────────────────────
alter table public.user_profiles
  add column if not exists role text not null default 'user';

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('user', 'admin'));

create index if not exists user_profiles_role_idx
  on public.user_profiles(role);

-- ── is_admin: admin_users 또는 profile.role = admin ─────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
  or exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- ── 사용자 목록 RPC (role 포함) ─────────────────────────────
-- 반환 타입 변경 시 CREATE OR REPLACE 불가 → 기존 함수 삭제 후 재생성
drop function if exists public.admin_list_users();

create function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  nickname text,
  phone text,
  profile_completed boolean,
  role text,
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
    case
      when exists (
        select 1 from public.admin_users au where au.user_id = p.user_id
      ) then coalesce(
        (select au.role from public.admin_users au where au.user_id = p.user_id limit 1),
        'admin'
      )
      else p.role
    end as role,
    u.created_at as joined_at,
    p.updated_at as profile_updated_at
  from public.user_profiles p
  join auth.users u on u.id = p.user_id
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated, service_role;

-- ── 이메일로 관리자 지정 (YOUR-EMAIL 변경) ───────────────────
-- update public.user_profiles p
-- set role = 'admin', updated_at = now()
-- from auth.users u
-- where u.id = p.user_id
--   and lower(u.email) = lower('YOUR-EMAIL@example.com');
--
-- insert into public.admin_users (user_id, role, note)
-- select u.id, 'admin', '14-1 email grant'
-- from auth.users u
-- where lower(u.email) = lower('YOUR-EMAIL@example.com')
-- on conflict (user_id) do update
--   set role = excluded.role, note = excluded.note;
