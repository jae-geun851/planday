# PlanDay

개인 일정관리 웹앱 프로젝트입니다.

## 주요 기능

- 홈 대시보드 / 달력 / 리스트 / 일정추가
- D-day, 카테고리, 반복, 완료 체크
- **Supabase** 로그인 + 클라우드 일정 저장

## 테스트 계정 (샘플 일정)

데모용 계정 **`demo@planday.app`** 으로 회원가입하면 샘플 일정이 자동으로 들어갑니다.  
다른 계정은 빈 상태로 시작하며, 본인이 추가한 일정만 저장됩니다.

## Supabase 설정 (최초 1회)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성
2. **Authentication → Providers → Email** 활성화
3. **SQL Editor**에서 `supabase-setup.sql` 내용 실행
4. **Project Settings → API**에서 URL과 `anon` key 복사
5. `index.html` 상단 스크립트의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`에 붙여넣기

```javascript
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

Supabase 키를 비워두면 기존처럼 **localStorage**로 동작합니다.

## 실행 방법

`index.html` 파일을 브라우저에서 열거나, GitHub Pages / Vercel로 배포하세요.

## GitHub

https://github.com/jae-geun851/planday
