# 성좌 결투 (Seongjwa Duel)

실시간 1:1 동시 턴 카드 PvP. Godot 클라이언트, Cloudflare Workers·Durable Objects 서버, Supabase(Postgres) DB. Steam 우선 출시 후 Android·iOS.

현재 단계: **이식 1단계 — DB 스키마와 게임 데이터 버전** (서버·클라이언트 코드는 다음 단계)

```text
seongjwa/
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
