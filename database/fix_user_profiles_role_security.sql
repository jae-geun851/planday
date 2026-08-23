-- 14-4차시: user_profiles.role 자가 승격 차단
-- Supabase SQL Editor → Run (create_admin_roles.sql 이후)
--
-- role 컬럼이 없으면 자동 추가 (14-1 내용 포함).
-- 일반 사용자는 role 변경 불가. SQL Editor에서만 admin 지정 가능.

-- ── role 컬럼 (없을 때만 추가) ───────────────────────────────
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

-- ── 사용자 목록 RPC (role 포함 · 관리자 대시보드) ─────────────
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

-- ── role 승격 차단 트리거 ─────────────────────────────────────
create or replace function public.guard_user_profiles_role()
returns trigger
language plpgsql
as $$
begin
  -- SQL Editor·service_role: auth.uid() null → 관리자 지정 허용
  if auth.uid() is null then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.role is distinct from 'user' then
      raise exception 'role change not allowed';
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.role is distinct from OLD.role then
      raise exception 'role change not allowed';
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists guard_user_profiles_role_trigger on public.user_profiles;
create trigger guard_user_profiles_role_trigger
  before insert or update on public.user_profiles
  for each row
  execute function public.guard_user_profiles_role();

-- RLS 보강: UPDATE 시 role 불변 (트리거와 이중 방어)
drop policy if exists "Users manage own profile" on public.user_profiles;

drop policy if exists "Users read own profile" on public.user_profiles;
create policy "Users read own profile"
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own profile" on public.user_profiles;
create policy "Users insert own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id and role = 'user');

drop policy if exists "Users update own profile" on public.user_profiles;
create policy "Users update own profile"
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own profile" on public.user_profiles;
create policy "Users delete own profile"
  on public.user_profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);
