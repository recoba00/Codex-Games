-- 6단계 백오피스 DB 함수 검사. 실패하면 예외, 끝에 rollback.
begin;
do $$
declare p uuid; rv uuid; ad uuid; a uuid; rep uuid; v bigint; v2 bigint; r jsonb; failed boolean; payload jsonb; sid uuid; s bigint; n integer;
begin
  -- 1) 초대 → 가입(한 번만) → 로그인 실패 5회 잠금
  perform public.staff_invite_create('h-admin', 'admin', null, 1);
  perform public.staff_invite_create('h-plan', 'planner', null, 1);
  perform public.staff_invite_create('h-rev', 'reviewer', null, 1);
  ad := (public.staff_register('h-admin', 'Boss', '관리자', 'x', 'y', 100000)->>'id')::uuid;
  p := (public.staff_register('h-plan', 'plan1', '기획', 'x', 'y', 100000)->>'id')::uuid;
  rv := (public.staff_register('h-rev', 'rev1', '검수', 'x', 'y', 100000)->>'id')::uuid;
  assert (public.staff_by_login('BOSS')->>'login') = 'boss', 'login lower';
  failed := false;
  begin perform public.staff_register('h-plan', 'plan2', '기획2', 'x', 'y', 1); exception when others then failed := sqlerrm = 'invite_invalid'; end;
  assert failed, 'invite reuse';
  for i in 1..5 loop perform public.staff_login_result(p, false, 3600); end loop;
  assert (select locked_until > now() from public.staff where id = p), 'lock after 5';
  sid := public.staff_login_result(rv, true, 3600);
  assert public.staff_session(sid)->>'role' = 'reviewer', 'session';
  perform public.staff_logout(sid);
  assert public.staff_session(sid) is null, 'logout';
  failed := false;
  begin perform public.staff_update(ad, 'ops', null); exception when others then failed := sqlerrm = 'last_admin'; end;
  assert failed, 'last admin';

  -- 2) 초안 가져오기 → 검수 요청(검증 실패 시 막힘) → 자기 승인 금지 → 승인 → 예약 → 배포 → 롤백
  payload := jsonb_build_object(
    'characters', jsonb_build_object('AU', jsonb_build_object('name', '아우렐', 'job', '기사', 'role', '탱커', 'faction', '불', 'rarity', '일반', 'offer', 'included',
       'hp', 1200, 'atk', 85, 'def', 45, 'spd', 85, 'crit', 5, 'passive_name', 'p', 'passive_text', 'pt', 'active_name', 'a', 'active_text', 'at',
       'passive_params', '{"passive_carry":0.5}'::jsonb, 'active_params', '{}'::jsonb)),
    'cards', jsonb_build_object('C01', jsonb_build_object('name', '베기', 'kind', 'attack', 'phase', 4, 'owner_character', null, 'cost', 1, 'coef', 1.0, 'hits', 1, 'pierce', 0, 'effect_text', 'ATK×1.0'),
                                'AU01', jsonb_build_object('name', '방패', 'kind', 'defense', 'phase', 1, 'owner_character', 'AU', 'cost', 2, 'coef', 2.5, 'hits', 1, 'pierce', 0, 'effect_text', '실드')),
    'spells', jsonb_build_object('SP01', jsonb_build_object('name', '수호', 'effect_text', '피해 0', 'value', null, 'cooldown', 5)),
    'settings', jsonb_build_object('turn_select_sec', jsonb_build_object('value', 20, 'unit', '초', 'desc', '턴')),
    'presets', jsonb_build_array(jsonb_build_object('character_id', 'AU', 'slot', 1, 'style', 'aggro', 'cards', to_jsonb(array_fill('C01'::text, array[10])))),
    'tables', jsonb_build_object('leaver', jsonb_build_object('window_days', 7)));
  v := public.bo_import_draft(null, '시험', p, payload, '{"errors":[],"blocks":["AU 예산"],"warnings":[]}');
  failed := false;
  begin perform public.bo_review(v, p, 'request', null, null); exception when others then failed := sqlerrm = 'validation_failed'; end;
  assert failed, 'blocks stop review';
  v := public.bo_import_draft(null, '시험2', p, payload, '{"errors":[],"blocks":[],"warnings":["w"]}');
  r := public.bo_version_data(v);
  assert r->'characters'->'AU'->>'hp' = '1200' and r->'presets'->'AU'->0->'cards'->>1 = 'C01' and r->'tables'->'leaver'->>'window_days' = '7', 'version data ' || r;
  perform public.bo_review(v, p, 'request', null, null);
  failed := false;
  begin perform public.bo_review(v, p, 'approve', null, null); exception when others then failed := sqlerrm = 'self_review'; end;
  assert failed, 'self approve';
  failed := false;
  begin perform public.bo_publish(v, ad); exception when others then failed := sqlerrm = 'not_approved'; end;
  assert failed, 'publish before approve';
  failed := false;
  begin perform public.bo_review(v, rv, 'reject', ' ', null); exception when others then failed := sqlerrm = 'reason_required'; end;
  assert failed, 'reject reason';
  perform public.bo_review(v, rv, 'reject', '문구 수정 필요', null);
  perform public.bo_review(v, p, 'request', null, null);
  perform public.bo_review(v, rv, 'approve', null, null);
  perform public.bo_review(v, ad, 'schedule', null, now() + interval '1 hour');
  assert jsonb_array_length(public.bo_due_publishes()) = 0, 'not due';
  update public.data_reviews set scheduled_for = now() - interval '1 minute' where version_id = v;
  assert (public.bo_due_publishes()->0->>'version')::bigint = v, 'due';
  perform public.bo_publish(v, ad);
  assert (select version_id from public.data_live) = v and (select state from public.data_reviews where version_id = v) = 'published', 'published';
  v2 := public.bo_import_draft(v, '시험3', p, payload, '{"errors":[],"blocks":[]}');
  perform public.bo_review(v2, p, 'request', null, null);
  perform public.bo_review(v2, rv, 'approve', null, null);
  perform public.bo_publish(v2, ad);
  v2 := public.bo_rollback(v, ad, '직전 버전으로');
  assert (select version_id from public.data_live) = v2 and (select kind from public.data_versions where id = v2) = 'rollback', 'rollback';
  assert jsonb_array_length(public.bo_versions(10)->'versions') >= 4, 'versions';

  -- 3) 제재: 정지(세션 끊김·로그인 차단) → 기간 지나면 자동 해제, 시즌 기록 처리(보드 제외) → 해제 시 RP 복구
  select account_id into a from public.auth_login('guest', 'dev:victim', 'steam', '', repeat('a', 64), 3600);
  s := public.bo_sanction(a, 'suspend', 7, ad, '결제 사기', 1);
  assert (select count(*) from public.sessions where account_id = a and revoked_at is null) = 0, 'sessions revoked';
  failed := false;
  begin perform public.auth_login('guest', 'dev:victim', 'steam', '', repeat('b', 64), 3600); exception when others then failed := sqlerrm = 'account_banned'; end;
  assert failed, 'banned login';
  update public.accounts set banned_until = now() - interval '1 second' where id = a;
  assert public.account_unban_expired('guest', 'dev:victim'), 'unban';
  perform public.auth_login('guest', 'dev:victim', 'steam', '', repeat('c', 64), 3600);
  assert (select status from public.accounts where id = a) = 'active', 'auto lift';
  perform public.season_current(28);
  insert into public.ratings (account_id, season_id, rp, tier_no) values (a, 1, 900, 9);
  s := public.bo_sanction(a, 'season_wipe', null, ad, '몰아주기', 1);
  assert (select rp from public.ratings where account_id = a and season_id = 1) = 0, 'wipe rp';
  assert not exists (select 1 from jsonb_array_elements(public.rank_board(1, 100)->'rows') x where (x->>'account')::uuid = a), 'board excluded';
  perform public.bo_sanction_revoke(s, ad, '오판');
  assert (select rp from public.ratings where account_id = a and season_id = 1) = 900, 'rp restored';
  perform public.bo_sanction(a, 'rank_restrict', 1, ad, '고의 지연', 1);
  perform public.bo_sanction(a, 'warn', null, ad, '닉네임', 1);
  r := public.sanction_status(a);
  assert r->>'rankUntil' is not null and jsonb_array_length(r->'warnings') = 1, 'status ' || r;
  perform public.sanction_ack(a);
  assert jsonb_array_length(public.sanction_status(a)->'warnings') = 0, 'ack';
  perform public.bo_sanction(a, 'rename', null, ad, '부적절한 닉네임', 1);
  assert (select display_name like 'Player%' and name_changes = 0 from public.accounts where id = a), 'rename';

  -- 4) 재화 지급·회수(사유 필수), 신고 24시간 1회, 우편 작업(중복 없음), 감사 로그 수정 불가
  assert public.bo_gold_adjust(a, 500, ad, '보상', 'adm:1') = 500, 'grant';
  failed := false;
  begin perform public.bo_gold_adjust(a, -600, ad, '회수', 'adm:2'); exception when others then failed := sqlerrm = 'gold_short'; end;
  assert failed, 'revoke over balance';
  insert into public.accounts (display_name) values ('Reporter') returning id into rep;
  perform public.report_create(rep, a, 'afk', null, '');
  failed := false;
  begin perform public.report_create(rep, a, 'name', null, ''); exception when others then failed := sqlerrm = 'report_limited'; end;
  assert failed, 'report limit';
  perform public.bo_mail_job(jsonb_build_object('target', jsonb_build_object('type', 'accounts', 'ids', jsonb_build_array(a)), 'title', '점검 보상', 'rewards', '[{"type":"gold","amount":100}]'), ad);
  n := public.mail_jobs_run(1);
  assert n = 1 and public.mail_jobs_run(1) = 0, 'mail job once';
  failed := false;
  begin update public.audit_log set reason = 'x'; exception when others then failed := sqlerrm = 'audit_log_immutable'; end;
  assert failed, 'audit immutable';
  assert jsonb_array_length(public.audit_list(100, null, '제재')) >= 4, 'audit list';
  r := public.bo_dashboard();
  assert (r->>'accounts')::int >= 1 and r ? 'characters7d', 'dashboard ' || r;
  raise notice 'step6 OK';
end $$;
rollback;
