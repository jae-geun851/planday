-- 11-1차시: 사용자 프로필 · 정책 버전 · 동의 이력 테이블
-- Supabase SQL Editor → New query → Run

-- ── 사용자 프로필 ─────────────────────────────────────────────
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  nickname text not null default '',
  phone text not null default '',
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_user_id_idx
  on public.user_profiles(user_id);

-- ── 정책 버전 ─────────────────────────────────────────────────
create table if not exists public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_type text not null check (policy_type in ('terms', 'privacy')),
  version text not null,
  title text not null,
  content text not null,
  effective_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (policy_type, version)
);

create index if not exists policy_versions_type_active_idx
  on public.policy_versions(policy_type, is_active);

-- ── 사용자 정책 동의 이력 ─────────────────────────────────────
create table if not exists public.user_policy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  policy_id uuid references public.policy_versions(id) on delete cascade not null,
  agreed boolean not null default true,
  policy_version text not null,
  agreed_at timestamptz not null default now(),
  unique (user_id, policy_id)
);

create index if not exists user_policy_consents_user_id_idx
  on public.user_policy_consents(user_id);

-- ── updated_at 자동 갱신 (프로필) ─────────────────────────────
create or replace function public.set_user_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row
  execute function public.set_user_profile_updated_at();

-- ── 권한 ──────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_profiles
  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.policy_versions
  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_policy_consents
  to anon, authenticated, service_role;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.user_profiles enable row level security;
alter table public.policy_versions enable row level security;
alter table public.user_policy_consents enable row level security;

drop policy if exists "Users manage own profile" on public.user_profiles;
create policy "Users manage own profile"
  on public.user_profiles
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users read active policies" on public.policy_versions;
create policy "Authenticated users read active policies"
  on public.policy_versions
  for select
  to authenticated
  using (is_active = true);

drop policy if exists "Users manage own consents" on public.user_policy_consents;
create policy "Users manage own consents"
  on public.user_policy_consents
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 초기 정책 버전 (학습용 임시 문구) ─────────────────────────
insert into public.policy_versions (policy_type, version, title, content, effective_at, is_active)
values
  (
    'terms',
    '1.0',
    'PlanDay 서비스 이용약관',
    E'제1조 (목적)\n본 약관은 PlanDay(이하 "서비스")의 이용 조건 및 절차를 정합니다.\n\n제2조 (서비스 내용)\n서비스는 일정 관리, AI 챗봇 대화 등 기능을 제공합니다.\n\n제3조 (회원의 의무)\n회원은 타인의 정보를 무단으로 사용하거나 서비스를 부정 이용해서는 안 됩니다.\n\n제4조 (서비스 변경)\n운영상 필요에 따라 서비스 내용이 변경될 수 있으며, 중요한 변경 시 사전 공지합니다.\n\n제5조 (면책)\n천재지변, 시스템 장애 등 불가항력으로 인한 손해에 대해 회사는 책임을 지지 않을 수 있습니다.\n\n시행일: 2026년 1월 1일',
    '2026-01-01 00:00:00+09',
    true
  ),
  (
    'privacy',
    '1.0',
    'PlanDay 개인정보 처리방침',
    E'1. 수집하는 개인정보\n- 필수: 이메일(인증), 닉네임, 전화번호\n- 자동 수집: 일정 데이터, AI 대화 기록, 서비스 이용 기록\n\n2. 수집 목적\n- 회원 식별 및 서비스 제공\n- 일정·대화 데이터 저장 및 동기화\n- 서비스 개선 및 고객 지원\n\n3. 보관 기간\n- 회원 탈퇴 시 또는 목적 달성 후 지체 없이 파기합니다.\n\n4. 제3자 제공\n- 원칙적으로 외부에 제공하지 않습니다. (법령에 따른 경우 예외)\n\n5. 이용자 권리\n- 개인정보 열람·수정·삭제를 요청할 수 있습니다.\n\n시행일: 2026년 1월 1일',
    '2026-01-01 00:00:00+09',
    true
  )
on conflict (policy_type, version) do nothing;
