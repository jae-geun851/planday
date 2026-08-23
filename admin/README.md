# PlanDay 관리자 서비스 (13장)

> **13-1차시** — 배포 및 구현 마일스톤 점검  
> 사용자 서비스(`../index.html`)와 **같은 Supabase DB**를 쓰는 **별도 운영자 화면**입니다.

## 사용자 vs 관리자

| 구분 | 사용자 서비스 (`/`) | 관리자 서비스 (`/admin/`) |
|------|---------------------|---------------------------|
| 대상 | 일반 가입자 | 지정된 관리자만 |
| 데이터 범위 | **내** 프로필·대화·사용량 | **전체** 가입자·사용량·비용 |
| 인증 | Supabase Email 로그인 | 동일 Auth + **admin_users** 권한 |
| UI | PlanDay SPA | 백오피스 템플릿 (13-2부터 연결) |

## 같은 DB를 쓰는 이유

- 12장까지 쌓인 `user_profiles`, `conversation_records`, `api_usage_*`가 **운영의 단일 진실(Single Source of Truth)** 입니다.
- 관리자 화면은 별도 DB를 두면 동기화·비용·불일치 문제가 생깁니다.
- **화면과 권한만 분리**하고, Supabase URL · Anon Key는 동일하게 맞춥니다.

## 관리자만 볼 수 있는 데이터

- 다른 사용자 이메일 · 닉네임 · 가입일
- 사용자별 API 토큰 · 예상 비용
- 전체 서비스 집계 (가입자 수, 월간 비용)
- (선택) 대화·약관 동의 현황

→ URL을 아는 일반 사용자가 접근하면 **안 됩니다**. 메뉴 숨김만으로는 부족하고, **DB RLS + RPC에서 `is_admin()`** 으로 막습니다.

## 13-1 마일스톤 체크리스트

- [ ] 사용자/관리자 역할 차이 정리
- [ ] `database/create_admin_roles.sql` Supabase에서 실행
- [ ] 본인 UUID로 `admin_users` 최초 1명 등록
- [ ] 일반 계정으로 `admin_list_users()` 호출 시 거부되는지 확인
- [ ] 관리자 계정으로 RPC 호출 시 사용자 목록 조회되는지 확인
- [ ] 13-2: 백오피스 템플릿 클론 → 이 폴더에 배치
- [ ] 템플릿 데모 로그인 → Supabase Auth로 교체
- [ ] `supabase-config.example.js` 복사 후 양쪽 앱에 동일 값 적용

## SQL 실행 순서 (전체)

1. `supabase-setup.sql`
2. `supabase-fix.sql`
3. `database/create_conversation_records.sql`
4. `database/add_prompt_tone_to_conversation_records.sql`
5. `database/create_user_prompts.sql`
6. `database/create_privacy_policy_tables.sql`
7. `database/create_api_usage_tables.sql`
8. **`database/create_admin_roles.sql`** ← 13-1

## 폴더 구조 (13-2 반영)

```
바이브코딩 웹개발/
├── 3. 일정관리 프로젝트/     ← 사용자 서비스 (이 README)
│   ├── index.html
│   ├── admin/               ← 13-1 마일스톤 · Supabase 설정 예시
│   └── database/
└── admin-template/          ← SvelteKit 백오피스 (13-2 클론)
    └── PLANDAY.md           ← PlanDay 연동 메모
```

## 13-2 이후 작업

1. ~~강의 백오피스 템플릿을 `admin/` 아래에 클론~~ → **`../admin-template/`** 에 클론 완료
2. 데모 계정 제거 → Supabase `signInWithPassword` (13-3)
3. 로그인 후 `admin_users` 존재 여부 확인, 없으면 차단/리다이렉트
4. 대시보드: `admin_list_users()`, `admin_usage_totals()` 연동
5. 환경변수·API 키는 **저장소에 커밋하지 않기** (`.gitignore`)

실행: [`../../README-13-2.md`](../../README-13-2.md)

## 보안 원칙

| ❌ 하지 말 것 | ✅ 해야 할 것 |
|-------------|-------------|
| 사용자 화면에 관리자 메뉴만 숨김 | RLS + RPC에서 권한 검사 |
| Anon Key로 service_role 작업 | 관리자 CRUD는 SQL Editor / Edge Function |
| 다른 사람 UUID를 URL로 추측 조회 | `is_admin()` 실패 시 403 처리 |
| `user_profiles.role` 자가 변경 | `fix_user_profiles_role_security.sql` 트리거 |

## 14-4 보안 SQL

Supabase SQL Editor에서 실행:

1. `database/fix_user_profiles_role_security.sql` — role 자가 승격 차단
2. Edge Function `gemini-chat` 재배포 — **Verify JWT ON**, 일 100회 제한
