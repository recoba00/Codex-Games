# Soul Link 작업 규칙

목표는 적은 컨텍스트로 정확하게 작업하는 것이다. 토큰 절약보다 안전성과 검증을 우선한다.

## 파일 찾기

1. `ABOUT.md`의 현재 구조와 `TASKS.md`의 해당 항목만 먼저 읽는다.
2. `rg -n`/`rg --files`로 관련 파일을 찾고 필요한 함수 주변만 읽는다. 전체 소스나 과거 로그를 한꺼번에 출력하지 않는다.
3. 설계는 관련 `docs/` 한두 개만 연다. 기존 규칙과 헬퍼를 먼저 재사용한다.
4. 질문만 받은 경우 코드를 바꾸지 않는다. 작업 요청이면 작은 변경 단위로 구현한다.

| 작업 | 먼저 볼 곳 | 좁은 검증 |
| --- | --- | --- |
| 퍼즐/전투/스탯 | `scripts/core/`, `data/`, `docs/COMBAT_V2.md` | `run-godot.ps1 -Mode test` |
| HUD/원화/VFX | `scripts/ui/`, `scenes/`, 관련 `assets/` | `-Mode combat` 또는 `-Mode render` |
| 캐릭터/스킨 운영 | `tools/admin/`, `tools/live-content.cjs`, `docs/LIVE_CONTENT.md` | `node tools/check-admin.cjs` |
| 온라인 대전 | `server/src/`, `scripts/online/`, `docs/FREE_TEST_INFRA.md` | `node --test server/test/*.test.mjs` |
| 웹/Toss/배포 | `web/`, `platform/toss/`, `.github/workflows/` | 관련 Node 계약 + Web export |
| 에셋/용량 | `assets/`, `tools/size-report.cjs` | 크기 보고서 + 눈으로 비교 |

`scripts/ui/main.gd`는 화면 조립과 전투 진행을 함께 조율하는 큰 파일이다. 전체를
읽기보다 `rg -n '^func ' scripts/ui/main.gd`로 진입점을 찾는다. 준비/온라인 UI는
`_build_preparation`/`_build_online_controls`, 온라인 상태는 `_online_*`, 전투 입력은
`finish_turn`/`_commit_turn`, 렌더 갱신은 `_refresh`, 결과는 `_show_result`에 있다.
실제 규칙은 `scripts/core/`, 서버 판정은 `server/`를 먼저 확인한다.

## 변경 원칙

- 하나의 규칙은 한 곳에서 정의한다. 데이터는 `data/`, 전투 판단은 `scripts/core/`, 표시와 연출은 `scripts/ui/`, 서버 권위는 `server/`에 둔다.
- 큰 파일을 무조건 분리하지 않는다. 반복 수정되는 독립 책임이나 테스트 경계가 보일 때만 모듈을 나눈다. 불필요한 래퍼와 중복 문서는 만들지 않는다.
- 코드 변경 전에 영향받는 호출자와 데이터 계약을 찾는다. 공개 저장/네트워크 형식 변경은 호환 경로와 테스트를 동반한다.
- 응답과 작업 기록은 변경 이유, 실제 검증, 남은 위험만 간결하게 적는다. 명령 출력 전체를 문서에 복사하지 않는다.
- 실패한 테스트만 넓게 조사하고, 성공한 테스트는 개수/범위로 보고한다. 최종 배포 전에는 필요한 전체 회귀를 다시 실행한다.
- `TASKS.md`는 현재 작업만, `ABOUT.md`는 안정적인 인수인계만 유지한다. 자세한 이력은 Git과 해당 기능 문서에 남긴다.

## 에셋 원칙

- 원본은 보존하고 배포용 파일만 교체한다. 축소나 포맷 변경 전후의 픽셀/알파 또는 화면 비교를 한다.
- 로컬 어드민은 긴 변 최대 1024px, WebP 품질 0.9로 등록하고 원본/전송 크기를 표시한다. 이것은 운영 HTTPS 게시를 뜻하지 않는다.
- Web export 후 `node tools/size-report.cjs build/web`로 WASM/PCK/전체 크기와 운영 파일 혼입을 검사한다. CI에도 같은 검사를 둔다.
- 로컬 미리보기 로그가 `build/web`에 남으면 검사는 의도적으로 실패한다. 파일을 배포 산출물 밖으로 옮기고 다시 검사한다. CI는 깨끗한 checkout에서 검사한다.
- 크기 제한을 넘으면 기능을 무작정 삭제하거나 화질을 낮추지 않는다. 증가 원인을 측정하고 의도적 변경인 경우 예산과 근거를 함께 갱신한다.
