-- 10c단계: 보안 점검 후속. 감사 기록 보호 트리거 함수의 search_path 고정(Supabase advisor 0011)
begin;
alter function private.audit_immutable() set search_path = '';
commit;
