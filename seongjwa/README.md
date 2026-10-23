# 성좌 결투 (Seongjwa Duel)

실시간 1:1 동시 턴 카드 PvP. Godot 클라이언트, Cloudflare Workers·Durable Objects 서버, Supabase(Postgres) DB. Steam 우선 출시 후 Android·iOS.

현재 단계: **서버 4단계 — 공개 매칭·AI 봇·랭크·시즌·이탈 누적** (Godot 클라이언트, 경제·상점은 다음 단계)

```text
seongjwa/
  server/                Cloudflare Worker (로그인·세션, 게임 데이터 API, 친구방 DO, 전투 엔진)
  supabase/migrations/   DB 스키마 (계정·세션, 게임 데이터 버전)
  supabase/seed/         xlsx에서 생성한 데이터 버전 (seed_data_v1.sql = 첫 버전)
  supabase/tests/        로컬 Postgres 점검 SQL
  tools/import_balance.py  수치 테이블 xlsx → 데이터 버전 SQL
  TASKS.md               진행 상황
```

## 게임 데이터가 들어가는 길

수치 테이블 xlsx → `import_balance.py` (오류 있으면 중단) → 초안 버전 → `data_publish(N)` 배포 → 서버는 배포 스냅샷 1행만 읽음.
배포된 버전은 수정할 수 없고, 롤백은 이전 버전을 복사한 새 버전으로 발행한다.

```bash
pip install openpyxl
python3 seongjwa/tools/import_balance.py TCG_밸런스테이블_v0.1.xlsx -o seed.sql --note "설명"
```

## 첫 데이터 버전 (seed_data_v1)

| 항목 | 내용 |
| --- | --- |
| 캐릭터 9 | AU 아우렐 · PY 피로스 · IG 이그니스 · SE 셀레네 · TE 테티스 · MO 모르테 · SL 실피 · UM 움브라 · SI 실렌티아 (전원 본편 포함) |
| 카드 34 | 공용 C01~C16, 전용 18장(캐릭터ID+2자리, 캐릭터당 2) |
| 스펠 8 | SP01 수호 … SP08 탈진 |
| 설정 29 | 시트 `설정값` 영문 키 |
| 추천덱 27 | 캐릭터 9 × 공세·균형·수비, 공용 10장(시트 `추천덱`, 상세 15) |
| 표 2 (v2) | 랭크 단계표 16단계(시트 `랭크_승점`), 이탈 패널티 5단계(시트 `이탈패널티`) |

## 로컬 점검

```bash
for f in seongjwa/supabase/migrations/*.sql; do psql -f "$f"; done
psql -f seongjwa/supabase/seed/seed_data_v1.sql
psql -f seongjwa/supabase/tests/step1_check.sql
```

Supabase 테스트 프로젝트 `seongjwa-dev`(서울, 무료)에 마이그레이션 3개와 데이터 버전 1을 적용했다(2026-10-23).

## 서버 API (server/)

| 요청 | 하는 일 |
| --- | --- |
| `POST /v1/auth/steam` `{ticket, deviceId}` | Steam 티켓 검증 → 계정 찾기/만들기 → 다른 기기 세션 종료 → 토큰 발급 |
| `POST /v1/auth/refresh` `{refreshToken}` | 리프레시 토큰 1회용 교체. 재사용·다른 기기 로그인 후에는 401 |
| `POST /v1/auth/logout` | 현재 세션 종료 |
| `GET /v1/me` | 토큰과 세션 유효성 확인 |
| `GET /v1/data/live` | 배포된 게임 데이터 스냅샷. ETag가 같으면 304 |
| `POST /v1/auth/dev` `{devId}` | 개발 전용 로그인. `DEV_LOGIN=1` 환경에서만 열림 |
| `POST /v1/rooms` `{options:{bans,turnSec}}` | 친구 비밀방 만들기(6자리 코드) |
| `POST /v1/rooms/{code}/join` | 방 참가(2명까지) |
| `POST /v1/rooms/{code}/ticket` → `GET /v1/rooms/{code}/ws?ticket=` | 세션 확인 후 일회용 티켓으로 웹소켓 접속 |
| `POST /v1/queue/ticket` `{humanOnly}` → `GET /v1/queue/ws?ticket=` | 랭킹전 매칭. 이탈 잠금·닷지 제한 확인 후 대기열 입장, 성사 시 `matched{code,mode,ai}` |
| `POST /v1/practice` `{difficulty: easy|normal|hard}` | AI 대전(연습) 방 만들기. 밴 없음, 승점 없음 |
| `GET /v1/rank/me` | 이번 시즌 단계·RP·연승·최고 단계·이탈 단계(숨은 MMR은 비공개) |
| `GET /v1/rank/board` | 시즌 랭킹 보드(마스터 중 상위 N%·최대 M명 레전드 표시) |
| `GET /dev` | 개발용 브라우저 테스트 화면. `DEV_LOGIN=1` 환경에서만 |

### 친구방 웹소켓 메시지 (클라이언트 → 서버)

`ready{ready,defaults}` · `options{bans,turnSec}`(방장) · `ban{characterId|null}` · `pick{characterId}` · `loadout{spells:[2], preset:1~3 | commonCards:[10]}` · `act{turn,cards:[uid…],spell,active}` · `timebank` · `surrender` · `leave` · `{"type":"ping"}`

서버 → 클라이언트는 상태가 바뀔 때마다 자리별 시야로 필터한 `room` 메시지 1개(상대 손패·덱 순서·제출 내용은 없음), 그 밖에 `error`·`afk_warning`.

### 판 흐름 (총괄 3·7·10·12장)

대기실(양측 준비) → 밴 10초(방장이 끌 수 있음) → 픽 15초(동시·비공개) → 상대 공개 + 스펠 2·덱 15초 → 전투(턴 20/30초, 양측 확정 시 즉시 공개) → 결과 → 재대결(방 유지).
끊기면 60초 유예 동안 서버가 자동 방어로 턴을 넘기고, 못 돌아오면 친구방은 결과 없음(void)으로 기록한다.

### 랭킹전·AI (총괄 8~10장, 상세 03)

- 매칭: 0~10초 ±100, 10~20초 ±200, 20초~ ±350 MMR. 30초(`ai_fallback_sec`)에 사람이 없으면 AI 랭킹전(승점 ×0.6, 하루 5판, MMR 미반영). 다이아 III 이상·"사람만 기다리기"는 AI 없이 범위를 넓히며 최대 120초.
- RP: `server/src/rank.mjs` 한 곳에서 계산(시트 `랭크_승점` 계산기 값과 테스트로 일치 확인). 연승 보너스, 브론즈 무감점·실버 50%, 골드·다이아 하한선, 새 단계 3판 보호, 시즌 리셋(시트 리셋 열)·초반 ×1.5.
- 이탈: 60초 유예 초과·AFK = 패배 + 10RP(소켓 비정상 끊김은 하루 첫 1회 면책: 패배만), 브론즈는 단계 시작점 아래로 안 내려감, 최근 7일 누적 단계(경고 → 매칭 지연 → 보상 감소 → 24·72시간 잠금), 정상 5판마다 1회 감면. 닷지 −5RP·5분 제한, 상대는 원래 대기 시각으로 우선 재입장.
- AI: 후보 조합 → 상대 예측(공개 정보만) → 피해·생존·읽기·자원 점수 → 난이도별 차선(쉬움 30%·보통 15%·어려움 5%). 확정 3~12초. 밴픽·스펠·덱 규칙 포함.
- 밸런스 시뮬레이션: `npm run simulate -- 20 > report.md` (AI 어려움 대 어려움, 캐릭터·덱·상성표). 최신 결과는 `docs/simulation_v4.md`.

## 테스트

```bash
cd seongjwa/server
npm test             # 엔진·API 단위 테스트(전 캐릭터 조합 243판 무작위 시뮬레이션 포함)
npm run test:live    # 실제 Workers 런타임(wrangler 로컬)에서 친구방 한 판 통합 테스트, 약 40초
npm run test:live:rank   # 같은 런타임에서 AI 연습·랭킹전 매칭·AI 전환·닷지·랭크 조회
LIVE_LONG=1 npm run test:live   # + 60초 재접속 유예 초과 시나리오
```

## 문서 해석이 필요했던 규칙 (기획 2차 답변으로 확정, 2026-10-23)

| # | 내용 | 현재 구현 | 근거 |
| --- | --- | --- | --- |
| 1 | 업화(피로스)·대조류(테티스) "2턴간" | 키워드 사전의 "N턴 효과는 다음 턴부터" 규칙을 따라 사용한 턴에는 효과 없음(다음 2턴 적용) | 상세 02 지속 턴 |
| 2 | 충전이 봉쇄로 무효될 때 | 처리 순서(단계 → 선택 순서)상 뒤쪽 카드부터 무효, 버려지고 에너지 소모 | 총괄 5장, 상세 02 |
| 3 | 영혼 수확(모르테) 피해 성격 | 고정 피해: 방어력·치명 미적용, 실드에 흡수됨, 폭주 적용 | 총괄 4장 |
| 4 | 셀레네 넘친 회복의 실드 | 다음 턴까지 이월(이번 턴 실드면 턴 종료 직후 사라져 의미 없음) | 총괄 4장, 상세 02 |
| 5 | 받아치기 반격 피해 | 공격 카드 피해 공식에서 공격 강화(분노)·조류만 빼고 적용(약화·치명 적용) | 상세 02 |
| 6 | 일륜 반격·처형·영혼 수확에 거울 반사 | 직접 피해로 보고 반사됨 | 상세 02 거울 |
| 7 | 이그니스 불씨 "적중" | 카드당 1회, HP 피해가 1 이상일 때 25% 판정 | 상세 02 작열 |
| 8 | 픽·스펠 시간 초과 | 픽: 선호 → 직전 사용 캐릭터 → 목록 첫 번째. 스펠·덱: 그 캐릭터로 직전에 쓴 것 → 수호·거울 + 균형 덱 | 총괄 7장 |
| 9 | 친구방 준비 단계에서 나감 | 판 취소, 대기실로(방 유지) | 총괄 12장 |
| 10 | 연결 끊김 중 자동 방어 턴 | AFK(3턴 무행동) 횟수에 세지 않음. 60초 유예가 따로 판정 | 총괄 10장 |
| 11 | Steam 패밀리 공유 | 허용하고 기록만 | 상세 09 |


- 접근 토큰 15분(Worker가 직접 서명·검증, 요청마다 DB 조회 없음), 리프레시 30일. DB에는 리프레시 토큰의 해시만 저장한다.
- 비밀값(`wrangler secret put`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TOKEN_SECRET`(32자 이상), `STEAM_WEB_API_KEY`, `STEAM_APP_ID`.

```bash
cd seongjwa/server && npm test
```

## 배포 (테스트 환경)

GitHub Actions `Seongjwa Server` → Run workflow(main). 테스트가 통과하면 Cloudflare에 배포하고 비밀값을 넣는다.
저장소 Settings → Secrets and variables → Actions 에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SEONGJWA_SUPABASE_SERVICE_KEY`, `SEONGJWA_TOKEN_SECRET`이 있어야 한다.
배포 후 `https://seongjwa.<계정>.workers.dev/dev` 를 탭 2개로 열어 친구방 한 판을 해 볼 수 있다(`dev_login` 켜고 배포했을 때만).
