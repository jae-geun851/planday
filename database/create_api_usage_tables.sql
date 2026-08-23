-- 12-2차시: AI API 사용량 · 일별 요약 · 가격 설정
-- PlanDay (Gemini 텍스트 API) — Supabase SQL Editor에서 실행
-- 참고: https://ai.google.dev/gemini-api/docs/pricing (가격 변경 시 아래 seed만 수정)

-- ── 모델별 가격 설정 ─────────────────────────────────────────
create table if not exists public.api_pricing_config (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  price_type text not null check (price_type in ('input_text', 'output_text')),
  unit text not null default 'per_1m_tokens',
  unit_price_usd numeric(12, 6) not null,
  effective_from timestamptz not null default now(),
  is_active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (model_name, price_type)
);

create index if not exists api_pricing_config_model_active_idx
  on public.api_pricing_config(model_name, is_active);

-- ── API 호출별 사용량 기록 ───────────────────────────────────
create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  conversation_id uuid references public.conversation_records(id) on delete set null,
  model_name text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_logs_user_id_idx
  on public.api_usage_logs(user_id, created_at desc);

create index if not exists api_usage_logs_conversation_id_idx
  on public.api_usage_logs(conversation_id);

-- ── 일별 사용량 요약 ─────────────────────────────────────────
create table if not exists public.api_usage_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  usage_date date not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  api_call_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, usage_date)
);

create index if not exists api_usage_daily_user_date_idx
  on public.api_usage_daily(user_id, usage_date desc);

-- ── updated_at (일별 요약) ───────────────────────────────────
create or replace function public.set_api_usage_daily_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists api_usage_daily_updated_at on public.api_usage_daily;
create trigger api_usage_daily_updated_at
  before update on public.api_usage_daily
  for each row
  execute function public.set_api_usage_daily_updated_at();

-- ── 권한 ─────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.api_pricing_config
  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.api_usage_logs
  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.api_usage_daily
  to anon, authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.api_pricing_config enable row level security;
alter table public.api_usage_logs enable row level security;
alter table public.api_usage_daily enable row level security;

drop policy if exists "Authenticated read active pricing" on public.api_pricing_config;
create policy "Authenticated read active pricing"
  on public.api_pricing_config
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "Users manage own usage logs" on public.api_usage_logs;
create policy "Users manage own usage logs"
  on public.api_usage_logs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own daily usage" on public.api_usage_daily;
create policy "Users manage own daily usage"
  on public.api_usage_daily
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 초기 가격 (Gemini 공식 Paid Tier 기준 · Standard) ─────────
-- gemini-3.6-flash: Input $1.50/M, Output $7.50/M (2026-03 문서 기준)
insert into public.api_pricing_config (model_name, price_type, unit, unit_price_usd, notes, is_active)
values
  ('gemini-3.6-flash', 'input_text', 'per_1m_tokens', 1.50, 'Gemini 3.6 Flash Standard input', true),
  ('gemini-3.6-flash', 'output_text', 'per_1m_tokens', 7.50, 'Gemini 3.6 Flash Standard output', true),
  ('gemini-2.0-flash', 'input_text', 'per_1m_tokens', 0.10, 'Legacy model reference', true),
  ('gemini-2.0-flash', 'output_text', 'per_1m_tokens', 0.40, 'Legacy model reference', true)
on conflict (model_name, price_type) do update set
  unit_price_usd = excluded.unit_price_usd,
  notes = excluded.notes,
  is_active = excluded.is_active;
