# TASKS

이식 순서: 기획 `전작_이식_목록.md` 5장.

## 1단계 계정·인증, 게임 데이터 버전
- [x] DB 스키마: accounts·identities·sessions, data_versions·data_live·characters·cards·spells·settings
- [x] xlsx 가져오기 스크립트, 첫 데이터 버전(seed_data_v1)
- [x] Worker: Steam 티켓 검증 → 계정 연결 → 세션 발급(기존 세션 종료), 토큰 갱신·로그아웃
- [x] Worker: 배포 스냅샷 로딩·캐시(`/v1/data/live`, ETag), 판 시작 시 고정(`pinLive`)
- [ ] 배포: Supabase 무료 프로젝트에 마이그레이션 적용, Worker 비밀값 등록, `DEV_LOGIN=1` 테스트 환경으로 확인
- [ ] Steam 앱 등록 후 실제 티켓으로 로그인 확인(STEAM_APP_ID·퍼블리셔 키 필요)
- [ ] 요청 제한(로그인·갱신) — 전작 전역 DO 1개 방식 대신 Cloudflare 레이트 리밋 사용(전작 검토 B6)

## 2·3단계 전투, 친구방
- [x] 동시 턴 전투 엔진(`server/src/engine/`): 처리 순서 0~5, 키워드 사전, 스펠 8·카드 34·패시브/액티브 9, 시야 필터, 결정적 난수
- [x] 친구방 DO(`server/src/room.mjs`): 6자리 코드, 밴·픽·스펠·덱(시간 초과 처리), 턴 타이머 20/30초·타임뱅크, 60초 유예·자동 방어, AFK, 항복, 재대결
- [x] 추천덱 27개를 데이터 버전에 포함, 판 결과 1회 저장(판 ID 키, 실패 시 재시도)
- [x] 개발용 브라우저 테스트 화면 `GET /dev`
- [x] 기획 2차 답변 반영(충전 무효 순서, 시간 초과 기본값, ban_sec·pick_sec·loadout_sec 설정 키)
- [x] Supabase 테스트 프로젝트 seongjwa-dev 생성·마이그레이션·데이터 v1 배포
- [x] Cloudflare 첫 배포: https://seongjwa.recoba00.workers.dev (테스트 환경, 개발 로그인·/dev 켜짐). 배포 후 자동 점검(health·데이터·로그인·방 생성)
## 4단계 매칭·AI·랭크
- [x] 공개 매칭 큐 DO(MMR 범위 확장, 30초 AI 전환·사람 우선, 다이아 이상 AI 없음, 사람만 기다리기, 120초 취소)
- [x] AI 봇(상세 03): 행동·밴픽·스펠·덱, 난이도 3단계, 확정 3~12초 / AI 대전(연습)
- [x] 랭크·시즌·RP·MMR·하한선·보호·리셋·레전드, 이탈 누적·닷지(시트 값과 테스트 일치)
- [x] 데이터 v2(랭크 단계표·이탈 표) Supabase 배포
- [x] 기획 3차 답변 반영: 이월 실드 연쇄 금지, 네트워크 면책(비정상 끊김 하루 첫 1회), 브론즈 이탈 단계 하한, mmr_k 설정 키
- [ ] 출시 준비: 첫 시즌은 출시 후 첫 월요일 00:00(KST)부터 28일 단위(테스트 서버는 첫 랭킹전 시점 자동 생성 유지)
- [x] 데이터 v3(설정값 추가 키 6개) Supabase 배포
- [ ] 밸런스: 시뮬레이션 v4(docs/simulation_v4.md) 결과 기획 검토 대기(원인: 추천덱 공격 카드 수)
- [ ] 경제·미션·우편, 상점·Steam 결제
- [ ] 백오피스 API, 에셋(R2), 신고·제재, 지표
