# 모아 (Moa Event Hub)

행사별 동아리 QR을 만들고 참여자의 이름, 성별, 연령 구분을 받아
동아리별 실적으로 자동 집계하는 행사 참여 관리 웹사이트입니다.

## 주요 기능

- 행사 및 동아리별 참여 링크·QR 생성
- 아이들이 사용하기 쉬운 모바일 참여 화면
- 이름, 성별, 연령 구분 저장
- 여러 동아리 참여를 동아리별 실적으로 각각 집계
- 실시간 통계와 CSV 내려받기

## 로컬 실행

Node.js `22.13.0` 이상이 필요합니다.

```bash
npm install
npm run dev
npm run build
```

## 주요 명령어

- `npm run dev`: start local development
- `npm run build`: production build
- `npm test`: build and product flow checks
- `npm run db:generate`: generate Drizzle migrations

## 기술 구성

- React 19 / vinext / Vite
- Cloudflare Worker / D1
- Drizzle ORM
