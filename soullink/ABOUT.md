# Soul Link 인수인계

최종 갱신: 2026-10-22

이 문서는 새 작업자나 다른 AI가 Soul Link를 바로 이어서 개발하기 위한 시작점이다.
먼저 이 문서와 `TASKS.md`를 읽고, 필요한 세부 문서만 `docs/`에서 연다.
코드 탐색과 검증 범위는 `docs/AI_WORKFLOW.md`를 따른다.

## 한눈에 보기

Soul Link는 Godot 4.7.2로 만드는 모바일 세로형 1:1 캐릭터 퍼즐 대전 게임이다.
퍼즐 매칭으로 공격/MP/강화/회복을 만들고, 캐릭터 액티브와 패시브를 조합한다.
카드와 스킨은 수집·외형 요소이며 동일 캐릭터의 전투 성능을 강화하지 않는 방향이다.

- 기준 해상도: 390x844, 세로형
- 렌더러: GL Compatibility
- 1차 출시: Apps in Toss
- 후속 출시: Steam, Google Play
- 공개 게임: `https://recoba00.github.io/Codex-Games/soullink/`
- 온라인 API: `https://soullink-match.recoba00.workers.dev`
- GitHub: `https://github.com/recoba00/Codex-Games`, `main`
- 로컬 경로: `C:\Users\user\Desktop\my\Codex-Games\soullink`
- 이전 원본 `C:\Users\user\Desktop\my\soul`은 참고/보존용이며 자동 동기화되지 않는다.

## 반드시 지킬 결정

1. Godot 게임이 제품 본체다. 이전 Phaser 화면을 감싸거나 다시 주 실행판으로 쓰지 않는다.
2. 무료 테스트 단계에서는 Cloudflare Workers Free, SQLite Durable Objects Free,
   Supabase Free만 사용한다. 결제수단, 유료 플랜, R2와 자동 유료 전환을 추가하지 않는다.
3. 비밀키는 Provider secret에만 둔다. Git, 게임 빌드, 로그, 문서와 채팅에 쓰지 않는다.
4. 어드민은 게임 빌드에서 제외한다. 현재 어드민은 PC loopback 전용이며 공개하지 않는다.
5. 클라이언트는 온라인 피해량/승패를 결정하지 않는다. Worker의 권위 상태를 표시한다.
6. 스킨은 외형만 바꾸며 능력치, 스킬, RNG를 바꾸지 않는다.
7. 지원 중인 데이터 필드와 효과 템플릿은 무배포 갱신이 가능하지만, 새 로직/UI/네트워크
   계약은 새 클라이언트 빌드가 필요하다.
8. 사용자가 요청한 대로 작업 종료 전 검증된 변경은 `main`에 푸시해 자동 배포하고
   Actions 및 공개 URL을 확인한다.
9. 이미지 원본을 덮어쓰지 않는다. 시각 품질을 유지하는 경량 배포본을 별도로 만든다.
10. 다른 사람이 만든 작업이나 사용자의 파일을 임의로 되돌리지 않는다.

## 현재 구현

### 게임

- 준비 화면, 캐릭터/상대/스킨/보드 선택과 캐릭터 도감
- 퍼즐 드래그, 15초 시간 제한과 자동 보정, AI 대전, 최대 8라운드
- 빨강 공격, 파랑 상대 MP 차감, 초록 다음 공격 강화, 보라 MP 회복, 황금 HP 회복
- 빨강이 없어도 기본 타격 1회, 매칭 뒤 MP 스킬 사용 또는 보유
- 화상, 침묵, 보호막, 강화, 방어, 치명타와 전체 피해 감소
- 캐릭터별 데이터 기반 액티브/패시브, 상성 보너스 5%
- 중앙 턴/AI 안내, 효과 원인/실제 수치, 카드 돌진·피격·회복·결과 연출
- 캐릭터 원화/스킨이 준비, 전투, 컷인과 결과 화면에 일관되게 반영

### 미디어와 Web

- 8초 인트로 영상, 로딩바, SKIP, 로고 낙하, 배경 영상 반복
- CC0 전자음악 2곡과 효과음 13종, 저장되는 음량/음소거
- 앱 아이콘과 5종 퍼즐 이미지, 발광 VFX, 모바일 세로 UI
- Godot Web 가상 키보드 활성화
- iOS 자동 확대 방지를 위한 viewport lock과 Godot 숨은 input/textarea 16px 처리
- manifest와 홈 아이콘은 있으나 정식 오프라인 PWA/service worker는 아직 없다.

### 온라인

- Supabase 익명 세션과 RLS
- 8자리 초대 코드, 2인 로비/준비, 일회용 45초 WebSocket 티켓
- Cloudflare Durable Object가 보드, 턴, HP/MP, 스킬, 시간초과와 승패를 소유
- 방 코드를 기기에 저장하고 끊김 시 1/2/4/8초 상한으로 자동 재접속
- 토큰 갱신과 새로고침 후 진행 중 경기 복원
- 공개 Web에서 방 생성, 로컬 Web에서 두 클라이언트 대전과 재접속 검증
- 영구 전적 저장과 랭킹은 아직 미완료

### 라이브 콘텐츠와 어드민

- 캐릭터/스킨 등록, 이미지 업로드, 수치 조정, 초안 저장과 인게임 게시
- 현재 경기에는 설정을 고정하고 준비 화면/다음 경기에서 새 revision 적용
- 지원되는 캐릭터 필드/효과 템플릿은 클라이언트 재빌드 없이 반영 가능
- 로컬 파일 기반 게시와 검증은 완료
- 운영 HTTPS 콘텐츠 게시와 안전한 원격 관리자 인증은 미구현

## 구조

- `project.godot`: Godot 프로젝트와 390x844 기준 설정
- `scenes/main.tscn`: 메인 씬
- `scripts/core/`: 결정적 보드, 전투, 스탯, 카탈로그 로직
- `scripts/ui/`: 준비/전투/도감 UI, 퍼즐, 원화, VFX, 오디오
- `scripts/online/`: Worker 클라이언트와 서버 상태 어댑터
- `data/`: 기본 게임/스탯/오디오/온라인/라이브 콘텐츠 설정
- `assets/`: 게임에 포함되는 원화, 퍼즐, 배경, 아이콘, 폰트와 효과음
- `web/`: Godot Web 셸, 인트로, 오디오 브리지, manifest와 아이콘
- `platform/toss/`: Apps in Toss SDK 호스트와 `.ait` 패키징 프로젝트
- `server/`: Cloudflare Worker와 Durable Object 권위 서버
- `supabase/migrations/`: 버전 관리되는 DB/RLS 스키마
- `tools/`: 빌드, 로컬 서버, 어드민, 게시, 패키징과 브라우저 검사
- `tests/`: GDScript/Node 계약과 회귀 테스트
- `docs/`: 기능별 상세 설계와 과거 검증 기록
- `build/`, `artifacts/`: 생성물. Git 소스가 아니며 필요한 결과만 재생성한다.

## 데이터 흐름

1. Godot 클라이언트가 Supabase 익명 세션을 Worker를 통해 준비한다.
2. 방 생성/참가 뒤 Worker가 발급한 일회용 티켓으로 WebSocket을 연다.
3. Durable Object가 모든 전투 상태를 계산하고 snapshot/receipt를 전송한다.
4. Godot은 서버 좌석을 항상 `나=0`, `상대=1`로 변환해 기존 HUD와 연출을 재사용한다.
5. 새 방은 게시된 캐릭터 카탈로그 revision을 고정한다. 진행 중 밸런스는 변하지 않는다.
6. 영구 결과 저장은 service-role secret이 없으므로 현재 비활성이다.

## 로컬 실행

Godot 4.7.2에서 `project.godot`를 열고 F5를 누르면 네이티브 테스트를 실행한다.

Web/어드민 미리보기는 먼저 프로젝트 빌드를 만든 뒤 다음 서버를 실행한다.

```powershell
node tools/serve-local.cjs --lan --port 5175
```

- PC 게임: `http://localhost:5175/games/soullink/`
- PC 전용 어드민: `http://localhost:5175/admin/`
- 같은 Wi-Fi 휴대폰: 실행 로그의 LAN 게임 주소

주요 Godot 작업:

```powershell
powershell -NoProfile -File tools/run-godot.ps1 -Mode import
powershell -NoProfile -File tools/run-godot.ps1 -Mode test
powershell -NoProfile -File tools/run-godot.ps1 -Mode smoke
powershell -NoProfile -File tools/run-godot.ps1 -Mode combat
powershell -NoProfile -File tools/run-godot.ps1 -Mode web
powershell -NoProfile -File tools/run-godot.ps1 -Mode pack
```

빠른 계약 테스트:

```powershell
node --test tests/host.test.cjs tests/audio.test.cjs tests/intro.test.cjs tests/catalog-seed.test.cjs tests/infra.test.cjs
node --test server/test/*.test.mjs
node tools/check-admin.cjs
node tools/check-live-content.cjs
```

Worker만 개발할 때:

```powershell
cd server
npm install
npm test
npm run dev
```

## 배포

`main`에 `soullink/**` 변경을 푸시하면 다음이 자동 실행된다.

1. `Soul Link Checks`: Node 계약과 Worker 테스트
2. `Deploy Soul Link Web`: Godot 4.7.2 Web export와 GitHub Pages 게시
3. 연결된 Cloudflare build: `soullink/server` Worker 배포

배포 후 아래를 반드시 확인한다.

- 모든 GitHub/Cloudflare check가 success
- 공개 URL HTTP 200, 타이틀 100% 로딩, 브라우저 warning/error 없음
- Worker `/health`와 GitHub Pages origin CORS
- 변경 기능의 실제 조작
- `git status --short`가 비어 있음

Cloudflare Worker URL은 API이며 게임 페이지가 아니다. 닷홈은 과거 배포 이력일 뿐 현재
공개 기준은 GitHub Pages다.

## 이미지와 용량 정책

앞으로 모든 배포에서 품질을 먼저 지키면서 용량을 줄인다.

- 승인 원본은 별도 보존하고 덮어쓰지 않는다.
- 실제 최대 표시 크기보다 불필요하게 큰 래스터를 배포하지 않는다.
- 사진형 원화/배경은 육안 비교 후 WebP로 만들고, 알파 UI/VFX는 lossless WebP 또는
  최적화 PNG를 선택한다.
- 캐릭터 얼굴, 선화, 텍스트, 프레임과 투명 가장자리는 확대 비교한다.
- 미사용/중복/이전 버전 이미지는 게임 산출물에서 제외한다.
- 변경 전후 파일 크기, 해상도, 포맷, 알파와 전체 PCK/Web 크기를 기록한다.
- 단순히 품질 수치를 일괄 하향하지 않는다. 에셋 종류별로 조정한다.
- 자동 최적화 도구는 출력이 원본보다 커지면 원본을 유지하고, 시각 검증 실패 시 배포를 막는다.
- 무손실 WebP도 Godot 텍스처로 가져온 뒤 PCK가 줄지 않을 수 있다. 실제 Web 출력
  크기를 비교해 효과가 확인된 변경만 유지한다. CI는 크기와 운영 파일 혼입을 검사한다.
- 현재 깨끗한 Web 파일은 약 57.38MiB(raw)이며, 대부분 엔진 WASM 37.68MiB와
  PCK 13.27MiB다. 로컬 미리보기 로그는 이 수치와 공개 배포에서 제외한다.

## 보안과 운영 경계

- `SUPABASE_SERVICE_ROLE_KEY`, 프로젝트 비밀번호, Cloudflare/GitHub 토큰을 읽거나 출력하지 않는다.
- 클라이언트에 service-role key를 넣지 않는다.
- 어드민 `/admin/`을 public proxy로 전달하지 않는다.
- DB migration은 live 데이터를 reset하지 않고 새 버전 파일로 추가한다.
- 활성 방은 생성 시 카탈로그를 고정한다.
- 무료 한도 도달 시 실패하도록 두며 자동 유료 fallback을 만들지 않는다.
- 배포 산출물은 게임만 포함한다. 어드민, 서버 소스, 테스트, 문서와 secret은 제외한다.

## 알려진 미완료

- 경기 결과 영구 저장과 랭킹/티어
- 운영용 캐릭터/스킨 게시 서버와 안전한 관리자 인증
- 실제 iPhone/Android의 키보드/확대/홈 화면 추가 검증
- Toss 콘솔 업로드와 QR 실기기 테스트
- 온라인 별도 스펠 서버 규칙
- 정식 오프라인 PWA와 버전 캐시 정책
- Steam/Google Play 내보내기와 스토어 연동
- 일반 원화/배경의 자동 경량화와 시각 비교 자동화 (Web 크기 예산 CI는 완료)

우선순위와 완료 조건은 `TASKS.md`가 기준이다.

## 세부 문서 지도

- `docs/COMBAT_V2.md`: 현재 전투 규칙
- `docs/CHARACTER_STATS.md`: 스탯 단위, 수식과 확장
- `docs/CHARACTER_ADMIN.md`: 캐릭터/스킨 로컬 어드민
- `docs/LIVE_CONTENT.md`: 무배포 콘텐츠 구조와 운영 미완료 범위
- `docs/FREE_TEST_INFRA.md`: 무료 Supabase/Cloudflare 인프라
- `docs/TOSS.md`: Apps in Toss 패키징과 실기기 체크
- `docs/DEPLOYMENT.md`: 과거/로컬 배포 절차와 검증
- `docs/AUDIO.md`, `docs/INTRO.md`, `docs/DUEL_ART.md`: 미디어 에셋과 라이선스
- `docs/QA_CHECKLIST.md`: 폭넓은 회귀 항목
- `docs/AI_WORKFLOW.md`: AI/개발자용 좁은 코드 탐색과 테스트 경로

## 다음 작업자가 시작할 때

1. `git status --short`와 `git log -5 --oneline`을 확인한다.
2. 이 문서와 `TASKS.md`를 읽는다.
3. P0 항목 하나를 선택하고 관련 세부 문서/코드만 조사한다.
4. 기존 테스트를 먼저 실행해 기준 상태를 확보한다.
5. 변경 범위를 작게 유지하고 자동 테스트와 대상 환경 검증을 함께 추가한다.
6. 문서와 `TASKS.md`를 실제 결과에 맞춰 갱신한다.
7. `main` 배포 후 Actions와 공개 게임을 확인한다.

완료됐다고 추정하지 말고 검증 증거가 있는 것만 완료로 기록한다.
