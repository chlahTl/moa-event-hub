# 모아 (Moa Event Hub)

행사별 동아리 참여와 QR 스탬프 투어를 함께 운영하는 행사 참여 관리 웹사이트입니다.

## 주요 기능

- 행사 및 동아리별 참여 링크·QR 생성
- 아이들이 사용하기 쉬운 모바일 참여 화면
- 이름, 성별, 연령 구분 저장
- 여러 동아리 참여를 동아리별 실적으로 각각 집계
- 실시간 통계와 CSV 내려받기
- 행사 초대 QR 이미지 저장·인쇄
- 최초 한 번만 참가자 정보를 받고 브라우저 세션 유지
- 여러 스탬프 지점과 지점별 QR 생성
- 모바일 카메라 QR 스캔, 중복 방지, 진행률 표시

## 스탬프 투어 사용 순서

1. `/admin`에서 행사를 만들고 자동으로 열린 초대 QR을 저장하거나 인쇄합니다.
2. 같은 행사에 스탬프 지점을 추가하고 각 지점 QR을 출력합니다.
3. 참가자는 초대 QR에서 이름·성별·연령 구분을 한 번 입력합니다.
4. 참가자 화면의 `QR 스캔` 버튼 또는 휴대폰 기본 카메라로 지점 QR을 읽습니다.
5. 받은 스탬프, 남은 지점, 전체 진행률이 참가자 화면에 바로 반영됩니다.

## 로컬 실행

Node.js `22.13.0` 이상이 필요합니다.

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
```

## 주요 명령어

- `npm run dev`: start local development
- `npm run build`: production build
- `npm test`: build and product flow checks
- `npm run db:generate`: generate Drizzle migrations

운영 환경은 Cloudflare Worker의 `DB` D1 바인딩을 사용합니다. 기존 데이터베이스는 API가 처음 실행될 때 필요한 열과 테이블을 안전하게 보완하며, 신규 환경에는 `drizzle/`의 마이그레이션을 사용할 수 있습니다.

## 주요 데이터 구조

- `events`: 행사 정보, 기간, 초대 토큰
- `participants`: 행사별 참가자와 해시된 브라우저 세션 토큰
- `stamp_points`: 행사별 스탬프 지점과 공개용 임의 토큰
- `stamp_records`: 참가자별 스탬프 기록

참가자·지점 조합에는 데이터베이스 고유 제약조건이 있어 같은 스탬프가 두 번 저장되지 않습니다. QR에는 이름 등 개인정보가 포함되지 않습니다.

## 기술 구성

- React 19 / vinext / Vite
- Cloudflare Worker / D1
- Drizzle ORM
