-- Supabase SQL Editor에서 실행하세요

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  date date not null,
  time text not null default '09:00',
  memo text default '',
  category text not null default 'other',
  important boolean not null default false,
  dday boolean not null default false,
  repeat_type text not null default 'none',
  done_dates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_id_idx on public.events(user_id);
create index if not exists events_date_idx on public.events(date);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.events to anon, authenticated, service_role;

alter table public.events enable row level security;

drop policy if exists "Users manage own events" on public.events;
create policy "Users manage own events"
  on public.events
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
