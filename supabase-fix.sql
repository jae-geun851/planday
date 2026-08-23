-- Supabase SQL Editor에서 실행하세요 (이미 events 테이블이 있는 경우)

-- 1) 컬럼 이름/누락 컬럼 수정
alter table public.events rename column repeat to repeat_type;
alter table public.events add column if not exists repeat_type text not null default 'none';
alter table public.events add column if not exists category text not null default 'other';
alter table public.events add column if not exists important boolean not null default false;
alter table public.events add column if not exists dday boolean not null default false;
alter table public.events add column if not exists done_dates jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists created_at timestamptz not null default now();

-- 2) 로그인 사용자에게 테이블 권한 부여 (permission denied 해결)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.events to anon, authenticated, service_role;

-- 3) RLS + 본인 일정만 접근 정책
alter table public.events enable row level security;

drop policy if exists "Users manage own events" on public.events;
create policy "Users manage own events"
  on public.events
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
