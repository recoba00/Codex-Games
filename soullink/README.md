# SOUL LINK · Godot

Git 개발 경로는 `C:\Users\user\Desktop\my\Codex-Games\soullink`다.
저장소는 `recoba00/Codex-Games`이며 기존 `my\soul`은 원본 보존용으로 남긴다.
기존 Phaser 웹판은 저장소 밖 `../../soul-link`에 참고용으로 보존한다.
기존 Godot 창/로컬 서버는 자동으로 새 경로로 바뀌지 않는다. `docs/REPOSITORY.md` 참고.

## 바로 실행

1. Godot 4.7.2에서 이 폴더의 `project.godot`를 연다.
2. **F5**로 실행한다. 메인 씬은 `scenes/main.tscn`으로 지정돼 있다.
3. 캐릭터/상대/스펠/보드를 선택하고 대전 시작. 마우스 드래그로 퍼즐을 조작한다.

현재: 준비/선택 → 실제 퍼즐/AI 전투 → 결과 → 다시 대전/선택 복귀.
승인 원화 3명, 4보드, 기본 15초, 시간초과 보정, 쉬운 1회 교환 AI,
액티브/스펠, 화상/침묵/보호막/다음 턴 강화와 최대 8라운드를 이식했다.
턴 중앙 알림, AI 조작/교환 표시, 매치별 실제 HP·보호막·MP 변화 설명,
카드 돌진·피격·숫자 효과를 연결했다. 연출 중에는 조작 시간과 입력이 멈춘다.
흑백/앰버 전술 HUD와 직접 생성한 발광 텍스처로 속성별 매치·회수·전기·절단·폭발을
표시한다. 공격 연쇄 연출은 1.1초에서 0.76초로 단축했고 타격 순간을 짧게 고정한다.
상업 이용·표기 불필요 CC0 전자음악 2곡과 13종 효과음을 연출에 연결했다.
상단 사운드 설정에서 BGM/효과음 음량과 전체 음소거를 조절한다. 출처는 `docs/AUDIO.md`.
Web/토스 로딩 화면은 제공 영상(8초)의 무음 영상+BGM → 딤/로고 낙하 → 터치 입장으로
교체했다. SKIP/실제 로딩바/뒤에서 무한 반복/영상 오류 복구를 포함한다.
네이티브 F5 시작 화면은 기존 준비 화면을 유지한다. 에셋/흐름은 `docs/INTRO.md`.
인트로 영상은 모든 화면에서 비율을 보존해 전체 표시하며, BGM은 엔진 로딩 전부터
재생을 시도하고 디코딩 버퍼로 반복한다. 자동재생 제한 기기는 첫 터치가 필요하다.
첨부 문장 이미지 5종(빨강/파랑/초록/보라/황금)과 첫 이미지 앱 아이콘을 적용했다.
퍼즐은 최신 첨부 검/번개/바람잎/초승달·별/황금 별빛 엠블럼으로 교체했으며 투명도를 유지한다.
황금은 HP 회복, 보라는 MP 충전. 스킬은 MP 40마다 횟수 제한 없이 사용한다.
확대 원화 타격/회복 컷인, 이미지 라운딩, 원화 중심 결과 화면과 효과 원인 표시를
포함한다. 규칙과 검증 범위는 `docs/DUEL_ART.md`.
구체적인 이전 기능의 이식 상태는 `TASKS.md`를 따른다. 웹 화면을 Godot에 임베드하지 않는다.

2026-10-20 전투 V2: 빨강 없이도 턴당 기본 타격, 빨강은 추가 피해, 매칭 뒤 6초 내
MP 스킬 사용/보유 선택, AI 의도·MP 문턱 표시. 상성 보너스는 5%로 축소했다.
이그니스는 화상, 셀레네는 직접 피해 감소, 실피는 직접 만든 콤보로 이번 타격을 강화한다.
HP 회복은 40/턴 상한 80으로 조정했다. 재편 스펠과 캐릭터별 데이터 기반 수치를 포함한다.
실제 규칙은 `docs/COMBAT_V2.md`, 캐릭터 등록/수치 조정은 `docs/CHARACTER_ADMIN.md`.
수치는 1차 실험값이며 경쟁 밸런스나 실기기 재미 검증을 완료한 것은 아니다.
스탯은 공통 정의 기반으로 체력/공격/방어/치명타 확률·피해/전체 피해 감소까지 확장했다.
기존 캐릭터의 신규 효과는 0으로 유지하며, 어드민에서 수치를 조정할 수 있다.
이후 성장·장비 보정을 붙일 계산 경로와 규칙은 `docs/CHARACTER_STATS.md`.
캐릭터와 외형 스킨을 분리했다. 어드민의 초안 저장 → 인게임 공개로 실행 중인 게임의
준비/도감에 신규 캐릭터·이미지를 반영한다. 스킨은 성능과 무관하며 선택한 외형은
대전·컷인·결과에서도 사용한다. 현재 로컬 검증 범위와 운영 서버 준비는 `docs/LIVE_CONTENT.md`.

## 검증 / 출력

### 로컬 웹 미리보기

`node tools/serve-local.cjs --lan --port 5175`로 `build/deploy` 게임과 공개 콘텐츠 API를 제공한다.
PC: `http://localhost:5175/games/soullink/`. 같은 와이파이 휴대폰에서는 실행 로그의
LAN 주소로 접속한다. 닷홈/외부 게임 서버를 사용하지 않으며 인트로 영상·BGM도 확인 가능하다.
휴대폰 접속은 PC 실행 유지 및 방화벽의 개인 네트워크 허용이 필요할 수 있다.
기본 실행에서 `--lan`을 빼면 PC만 접속할 수 있다. 배포 카탈로그에 없는 소스/백업은 제공하지 않는다.
로컬 HTTP 접속도 휴대폰의 정식 PWA 설치/오프라인 지원을 의미하지 않는다.
어드민: `http://localhost:5175/admin/`에서 캐릭터/스킨·이미지 등록 → 초안 저장 → 인게임 공개.
최초 기능이 포함된 클라이언트 이후에는 공개한 데이터가 재빌드/새로고침 없이 자동 반영된다.
진행 중인 대전의 설정은 유지한다. 새 코드/효과 유형은 여전히 클라이언트 업데이트가 필요하다.
어드민은 PC 로컬 전용으로 LAN/공개 서버에서는 제공하지 않는다.

```powershell
powershell -NoProfile -File tools/run-godot.ps1 -Mode import
powershell -NoProfile -File tools/run-godot.ps1 -Mode test
powershell -NoProfile -File tools/run-godot.ps1 -Mode smoke
powershell -NoProfile -File tools/run-godot.ps1 -Mode render
powershell -NoProfile -File tools/run-godot.ps1 -Mode feedback
powershell -NoProfile -File tools/run-godot.ps1 -Mode combat
powershell -NoProfile -File tools/run-godot.ps1 -Mode audio
powershell -NoProfile -File tools/run-godot.ps1 -Mode web
powershell -NoProfile -File tools/run-godot.ps1 -Mode pack
```

`render`는 실제 GPU 창을 잠깐 열어 엔진 입력/화면을 자동 검증하고 닫는다.
`feedback`은 턴/매치/카드 타격/AI 이동/보호막 연출과 중단·복귀를 GPU에서 검사한다.
`combat`은 재편 실제 터치, 매칭 후 MP 행동/시간 제한과 신규 캐릭터 원화·수치를 검사한다.
`node tools/check-admin.cjs`는 임시 파일/API/브라우저 어드민 검사,
`node tools/check-live-content.cjs`는 실제 게임의 라이브 등록·도감·외형·연결 실패 복구 검사,
`node tools/combat-web-check.cjs`는 실행 중인 5175 로컬 출력의 실제 전투 검증이다.
전투 연출의 상태·수치 계약은 `docs/COMBAT_FEEDBACK.md`를 따른다.
`web` 출력은 `build/web/`이며 단일 스레드 Compatibility 내보내기다.
`pack`은 실제 출력 PCK에서 준비/스펠/AI/완료 경기 흐름을 검사한다.
도구의 Godot 경로는 `-Godot` 인자로 변경할 수 있다. 테스트용 엔진 설정/로그는
이 프로젝트의 `build/`, `artifacts/`에만 두고 사용자의 에디터 설정을 덮어쓰지 않는다.

## 출시 방향

토스 우선, 이후 Steam/Google Play. 토스에는 Godot 웹 출력과 앱인토스 SDK 브리지가
필요하다. Web 출력 생성 성공이 토스 호환/출시/HTTP 공개 성공을 뜻하지 않는다.
공개 주소: http://recoba00.dothome.co.kr/games/soullink/
현재 닷홈 월간 트래픽 소진으로 공개 접속/재배포는 보류 중이다. 새 전투는 로컬로 제공한다.
엔진/팩/JS는 gzip 약 18.1MB로 전송된다(원본 약 47.6MB). 음원 15개는 총 약 2.8MB로,
BGM은 필요할 때 받는다. 비활성 시 타이머 정지와
호스트 안전영역/뒤로가기 확인 처리를 연결했다.
단일 스레드 전용 HTML 셸로 HTTP 동작을 검증했다. 엔진 오디오 대신 표준 Web Audio로
첫 터치 후 소리를 재생한다. 엔진 믹서만 Dummy로 유지하며 HTTP에서도 BGM/효과음
신호를 검증했다. 아이콘/manifest/홈 화면 메타를 포함하지만,
정식 PWA 자동 설치·오프라인 기능은 제공하지 않는다. 실제 iPhone 설치는 미검증이다.
Safari에서 공유 → 홈 화면에 추가 → 웹 앱으로 열기(표시되는 경우) → 추가 후 아이콘으로
확인한다. 배포 절차는 `docs/DEPLOYMENT.md`.

토스 프로젝트는 `platform/toss/`, 앱 식별자는 사용자가 확인한 `soullink`다.
SDK 3.8.1과 공식 Devtools 모의 검증 및 `platform/toss/soullink.ait`(약 24.7MB)
생성/내용 검증을 마쳤다. 토스 콘솔 업로드/실제 앱 실행은 아직 하지 않았다.
재빌드와 다음 실기기 검증 절차는 `docs/TOSS.md`를 따른다.

Windows/Android 제품용 설정·SDK/서명·상점 연동도 아직 하지 않았다.
원화는 기존 승인 파일, UI 심볼은 Lucide, 한글 폰트는 Pretendard이며 관련 라이선스는
`assets/licenses/`에 포함한다.
