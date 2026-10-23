-- 1단계 스키마 점검 (로컬 Postgres 전용, 운영 DB에서 실행 금지)
-- 순서: migrations/*.sql → seed/seed_data_v1.sql → 이 파일
-- 기대: 아래 "기대: 오류" 줄은 모두 ERROR, 나머지는 정상
\set ON_ERROR_STOP 1
select public.data_publish(1) as published;
select count(*) as characters from characters where version_id = 1;   -- 9
select count(*) as cards from cards where version_id = 1;                                  -- 34
select count(*) as spells from spells where version_id = 1;                                -- 8
select count(*) as settings from settings where version_id = 1;                            -- 29
\set ON_ERROR_STOP 0
update characters set hp = 999 where version_id = 1;                                       -- 기대: 오류(배포 버전 동결)
select public.data_create_draft(1, 'check', null) as v \gset
update cards set phase = 3 where version_id = :v and id = 'C01';                           -- 기대: 오류(종류↔단계)
insert into cards values (:v,'SE03','x','attack',4,'AU',1,1,1,0,'x','{}');                 -- 기대: 오류(전용 주인↔ID)
update characters set offer = 'paid' where version_id = :v and id = 'AU';                   -- 기대: 오류(제공 방식)
insert into accounts default values returning id \gset a_
insert into sessions(account_id,platform,refresh_token_hash,expires_at) values (:'a_id','steam',repeat('a',64),now()+interval '1 day');
insert into sessions(account_id,platform,refresh_token_hash,expires_at) values (:'a_id','steam',repeat('b',64),now()+interval '1 day'); -- 기대: 오류(활성 세션 1개)
