-- PlanDay 챗봇 대화 기록 테이블
-- Supabase SQL Editor에서 실행하세요 (9-2차시)

-- 세션 1개 = 대화 1개 (messages 컬럼에 user/assistant 메시지 배열 저장)
create table if not exists public.conversation_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default '새 대화',
  messages jsonb not null default '[]'::jsonb,
  system_message text not null default '',
  prompt_tone text not null default 'friendly',
  prompt_tone_label text not null default '친근한 선생님',
  prompt_is_custom boolean not null default false,
  prompt_applied text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- messages 예시:
-- [
--   { "role": "user", "content": "오늘 일정 알려줘", "created_at": "..." },
--   { "role": "assistant", "content": "...", "created_at": "...",
--     "usage": { "model": "gemini-3.6-flash", "input_tokens": 120, "output_tokens": 45,
--                "total_tokens": 165, "estimated_cost_usd": 0.0005 } }
-- ]

create index if not exists conversation_records_user_id_idx
  on public.conversation_records(user_id);

create index if not exists conversation_records_updated_at_idx
  on public.conversation_records(updated_at desc);

-- updated_at 자동 갱신
create or replace function public.set_conversation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversation_records_updated_at on public.conversation_records;
create trigger conversation_records_updated_at
  before update on public.conversation_records
  for each row
  execute function public.set_conversation_updated_at();

-- 권한 (permission denied 방지)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.conversation_records
  to anon, authenticated, service_role;

-- RLS: 로그인한 사용자는 본인 기록만 접근
alter table public.conversation_records enable row level security;

drop policy if exists "Users manage own conversation records" on public.conversation_records;
create policy "Users manage own conversation records"
  on public.conversation_records
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
