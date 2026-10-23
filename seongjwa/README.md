# 성좌 결투 (Seongjwa Duel)

실시간 1:1 동시 턴 카드 PvP. Godot 클라이언트, Cloudflare Workers·Durable Objects 서버, Supabase(Postgres) DB. Steam 우선 출시 후 Android·iOS.

현재 단계: **이식 1단계 — 계정·인증과 게임 데이터 버전** (전투·클라이언트는 2단계)

```text
seongjwa/
  server/                Cloudflare Worker (로그인·세션, 게임 데이터 API)
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

## 로컬 점검

```bash
psql -f seongjwa/supabase/migrations/20261023000000_step1_accounts_gamedata.sql
psql -f seongjwa/supabase/seed/seed_data_v1.sql
psql -f seongjwa/supabase/tests/step1_check.sql
```

운영 Supabase에는 아직 적용하지 않았다.

## 서버 API (server/)

| 요청 | 하는 일 |
| --- | --- |
| `POST /v1/auth/steam` `{ticket, deviceId}` | Steam 티켓 검증 → 계정 찾기/만들기 → 다른 기기 세션 종료 → 토큰 발급 |
| `POST /v1/auth/refresh` `{refreshToken}` | 리프레시 토큰 1회용 교체. 재사용·다른 기기 로그인 후에는 401 |
| `POST /v1/auth/logout` | 현재 세션 종료 |
| `GET /v1/me` | 토큰과 세션 유효성 확인 |
| `GET /v1/data/live` | 배포된 게임 데이터 스냅샷. ETag가 같으면 304 |
| `POST /v1/auth/dev` `{devId}` | 개발 전용 로그인. `DEV_LOGIN=1` 환경에서만 열림 |

- 접근 토큰 15분(Worker가 직접 서명·검증, 요청마다 DB 조회 없음), 리프레시 30일. DB에는 리프레시 토큰의 해시만 저장한다.
- 비밀값(`wrangler secret put`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TOKEN_SECRET`(32자 이상), `STEAM_WEB_API_KEY`, `STEAM_APP_ID`.

```bash
cd seongjwa/server && npm test
```
