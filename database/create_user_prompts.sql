-- 10-3차시: 사용자별 커스텀 프롬프트 테이블
-- Supabase SQL Editor → New query → Run

create table if not exists public.user_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text not null default '',
  content text not null,
  type text not null default 'custom',
  is_favorite boolean not null default false,
  is_default boolean not null default false,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_prompts_user_id_idx
  on public.user_prompts(user_id);

create index if not exists user_prompts_user_favorite_idx
  on public.user_prompts(user_id, is_favorite desc, usage_count desc);

-- updated_at 자동 갱신
create or replace function public.set_user_prompt_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_prompts_updated_at on public.user_prompts;
create trigger user_prompts_updated_at
  before update on public.user_prompts
  for each row
  execute function public.set_user_prompt_updated_at();

-- 권한
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_prompts
  to anon, authenticated, service_role;

-- RLS: 본인 프롬프트만 접근
alter table public.user_prompts enable row level security;

drop policy if exists "Users manage own prompts" on public.user_prompts;
create policy "Users manage own prompts"
  on public.user_prompts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
