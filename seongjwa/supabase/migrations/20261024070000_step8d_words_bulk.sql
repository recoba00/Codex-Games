-- 8d단계: 금칙어 일괄 추가(상세 13). 이미 있는 단어(정규화 후 같은 단어·같은 방식)는 건너뛰고, 감사 로그는 한 줄로 남긴다.
begin;
create or replace function public.bo_words_bulk(p_staff uuid, p_items jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; w text; m text; added integer := 0; skipped jsonb := '[]'; invalid jsonb := '[]';
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then
    raise exception 'value_invalid' using errcode = 'P0001';
  end if;
  for it in select value from jsonb_array_elements(p_items) loop
    w := trim(coalesce(it->>'word', ''));
    m := coalesce(nullif(it->>'match', ''), 'contains');
    if char_length(w) not between 1 and 40 or private.norm_name(w) = '' or m not in ('contains', 'prefix', 'exact')
       or coalesce(it->>'kind', 'profanity') not in ('profanity', 'hate', 'impersonation', 'staff', 'other')
       or coalesce(it->>'lang', 'ko') not in ('ko', 'en', 'ja', 'any') then
      invalid := invalid || to_jsonb(w); continue;
    end if;
    if exists (select 1 from public.banned_words where removed_at is null and private.norm_name(word) = private.norm_name(w) and match = m) then
      skipped := skipped || to_jsonb(w); continue;
    end if;
    insert into public.banned_words (word, lang, kind, match, note, created_by)
    values (w, coalesce(it->>'lang', 'ko'), coalesce(it->>'kind', 'profanity'), m, coalesce(p_note, ''), p_staff);
    added := added + 1;
  end loop;
  perform public.audit_add(p_staff, '금칙어', '금칙어 일괄 추가', jsonb_build_object('added', added, 'skipped', skipped, 'invalid', invalid), coalesce(p_note, ''));
  return jsonb_build_object('added', added, 'skipped', skipped, 'invalid', invalid);
end; $$;

-- 여러 닉네임 한 번에 미리 검사(오탐 점검용)
create or replace function public.names_check(p_names jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', n, 'hits', public.name_matches(n))), '[]')
    from jsonb_array_elements_text(case when jsonb_typeof(p_names) = 'array' then p_names else '[]' end) n;
$$;

revoke execute on function public.bo_words_bulk(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.bo_words_bulk(uuid, jsonb, text) to service_role;
revoke execute on function public.names_check(jsonb) from public, anon, authenticated;
grant execute on function public.names_check(jsonb) to service_role;
commit;
