# TASKS

이식 순서: 기획 `전작_이식_목록.md` 5장.

## 1단계 계정·인증, 게임 데이터 버전
- [x] DB 스키마: accounts·identities·sessions, data_versions·data_live·characters·cards·spells·settings
- [x] xlsx 가져오기 스크립트, 첫 데이터 버전(seed_data_v1)
- [ ] Worker: Steam 티켓 검증 → 계정 연결 → 세션 발급(기존 세션 종료)
- [ ] Worker: 배포 스냅샷 로딩·캐시, 판 시작 시 고정

## 2단계 이후
- [ ] 동시 턴 전투 엔진, 판 DO, 재접속(60초 유예)
- [ ] 친구방(6자리), 밴·픽·스펠·덱, 결과 저장(판 ID 키, data_version 기록)
- [ ] 공개 매칭, AI 봇, 랭크·시즌
- [ ] 경제·미션·우편, 상점·Steam 결제
- [ ] 백오피스 API, 에셋(R2), 신고·제재, 지표
