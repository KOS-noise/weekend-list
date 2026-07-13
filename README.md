# Weekly Planner

사진 느낌의 미니멀 주간계획표 데스크톱 앱입니다. Supabase로 기기 간 동기화합니다.

## 기능

- 월~일 체크리스트 + NOTE
- 현재 주 날짜 자동 반영, 지난주/다음주 이동
- Supabase 클라우드 저장 (`planner_weeks` / `planner_tasks`)
- 첫 실행 시 자동 실행 여부 질문

## .env 설정

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=Publishable키
SYNC_CODE=두노트북이같은코드
```

## 실행

```powershell
cd "D:\KOS noise\Final\weekend-list"
npm.cmd install
npm.cmd start
```

## 배포 설치파일

```powershell
npm.cmd run dist
```

`dist` 폴더의 Setup 파일이 생성됩니다.
