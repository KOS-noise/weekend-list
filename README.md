# Weekly Planner

사진 느낌의 미니멀 주간계획표 데스크톱 앱입니다.

## 기능

- 월~일 7칸 + NOTE 입력
- DATE 입력란
- 내용 자동 저장 (앱 종료 후에도 유지)
- **첫 실행 시** 「컴퓨터 키면 자동으로 실행하겠습니까?」 질문
  - **예** → Windows 시작 프로그램에 등록
  - **아니요** → 등록하지 않음
- 하단에서 자동 실행 ON/OFF 다시 변경 가능

## 개발 실행

```bash
cd "D:\KOS noise\Final\weekend-list"
npm install
npm start
```

처음 실행하면 자동 실행 여부를 묻는 창이 뜹니다.

## 설치 파일(배포용) 만들기

```bash
npm run dist
```

완료되면 `dist` 폴더에 `Weekly Planner Setup x.x.x.exe` 설치 파일이 생성됩니다.  
이 파일을 다른 PC에 복사해 설치하면 됩니다.

설치 후 앱을 처음 실행할 때 자동 실행 질문이 나옵니다.

## 자동 실행이 다시 뜨지 않을 때

설정은 사용자 폴더에 저장됩니다. 질문을 초기화하려면 아래 파일을 삭제하세요.

`%APPDATA%\weekend-list\settings.json`

## 데이터 위치

계획 내용: `%APPDATA%\weekend-list\planner-data.json`
