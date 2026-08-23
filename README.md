# PlanDay

개인 일정관리 웹앱 프로젝트입니다.

## 주요 기능

- 홈 대시보드 / 달력 / 리스트 / 일정추가
- D-day, 카테고리, 반복, 완료 체크
- **Supabase** 로그인 + 클라우드 일정 저장
- **AI 챗봇** (Gemini) + 사용량·예상 비용 통계
- **대화 기록** 저장 · 기록 탭에서 삭제

## 테스트 계정 (샘플 일정)

데모용 계정 **`demo@planday.app`** 으로 회원가입하면 샘플 일정이 자동으로 들어갑니다.  
다른 계정은 빈 상태로 시작하며, 본인이 추가한 일정만 저장됩니다.

## Supabase 설정 (최초 1회)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **Authentication → Providers → Email** 활성화
3. **SQL Editor**에서 `database/` 폴더 SQL을 강의 순서대로 실행
4. **Project Settings → API**에서 URL과 Anon key 복사
5. `js/supabase-config.example.js`를 복사해 `js/supabase-config.js` 생성 후 값 입력

```bash
copy js\supabase-config.example.js js\supabase-config.js
```

```javascript
window.PLANDAY_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "your-anon-key"
};
```

`js/supabase-config.js`는 `.gitignore` 대상입니다. GitHub에는 example만 올라갑니다.

Supabase 키를 비워두면 **localStorage** 모드로 동작합니다.

## 실행 방법

`index.html` 파일을 브라우저에서 열거나, GitHub Pages / Vercel로 배포하세요.

## 13~14장 — 관리자 서비스

- SQL·보안·사용량: `database/` 폴더, `admin/README.md`
- 관리자 앱: **상위 폴더** `../admin-template/` (SvelteKit, GitHub **Private** `planday-admin`)
- 사용자: `npm run dev` → http://localhost:5173
- 관리자: `cd ../admin-template && npm run dev -- --port 5174`

## GitHub

https://github.com/jae-geun851/planday
