-- 10-2차시: conversation_records에 AI 톤 정보 컬럼 추가
-- Supabase SQL Editor → New query → Run (기존 데이터 유지)

alter table public.conversation_records
  add column if not exists prompt_tone text not null default 'friendly';

alter table public.conversation_records
  add column if not exists prompt_tone_label text not null default '친근한 선생님';

alter table public.conversation_records
  add column if not exists prompt_is_custom boolean not null default false;

alter table public.conversation_records
  add column if not exists prompt_applied text not null default '';

-- prompt_tone: friendly | strict | business | casual | custom
-- prompt_tone_label: 화면 표시용 (친근한 선생님, 직접 작성 등)
-- prompt_is_custom: 직접 작성 프롬프트 여부
-- prompt_applied: 대화 시작 시 실제 적용된 톤 지시문
