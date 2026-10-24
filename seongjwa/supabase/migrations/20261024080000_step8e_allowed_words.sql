-- 8e단계: 허용 단어(예외)와 금칙어 방식 바꾸기(기획답변 19차, 상세 13).
-- 닉네임을 정규화한 뒤 허용 단어를 긴 것부터 빼고, 남은 글자로 금칙어를 검사한다. `성기사` 통과, `성기사성기`는 `성기`가 남아 거부.
begin;
create table public.allowed_words (
  id bigint generated always as identity primary key,
  word text not null check (char_length(word) between 1 and 40),
  note text not null default '',
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.staff(id)
);
create unique index allowed_words_live on public.allowed_words (private.norm_name(word)) where removed_at is null;

create or replace function public.name_matches(p_name text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n text := private.norm_name(p_name); a text;
begin
  for a in select private.norm_name(word) from public.allowed_words where removed_at is null and private.norm_name(word) <> ''
            order by char_length(private.norm_name(word)) desc loop
    n := replace(n, a, '');
  end loop;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'word', w.word, 'kind', w.kind, 'match', w.match)), '[]')
            from public.banned_words w
           where w.removed_at is null and private.norm_name(w.word) <> ''
             and case w.match when 'exact' then n = private.norm_name(w.word)
                              when 'prefix' then left(n, char_length(private.norm_name(w.word))) = private.norm_name(w.word)
                              else strpos(n, private.norm_name(w.word)) > 0 end);
end; $$;

create or replace function public.bo_allowed(p_q text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'word', w.word, 'note', w.note, 'createdAt', w.created_at, 'by', s.name) order by w.id desc), '[]')
    from public.allowed_words w left join public.staff s on s.id = w.created_by
   where w.removed_at is null and (coalesce(p_q, '') = '' or w.word ilike '%' || p_q || '%');
$$;

create or replace function public.bo_allowed_bulk(p_staff uuid, p_words jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w text; added integer := 0; skipped jsonb := '[]'; invalid jsonb := '[]';
begin
  if jsonb_typeof(p_words) <> 'array' or jsonb_array_length(p_words) = 0 or jsonb_array_length(p_words) > 500 then
    raise exception 'value_invalid' using errcode = 'P0001';
  end if;
  for w in select trim(value) from jsonb_array_elements_text(p_words) loop
    if char_length(w) not between 1 and 40 or private.norm_name(w) = '' then invalid := invalid || to_jsonb(w); continue; end if;
    if exists (select 1 from public.allowed_words where removed_at is null and private.norm_name(word) = private.norm_name(w)) then skipped := skipped || to_jsonb(w); continue; end if;
    insert into public.allowed_words (word, note, created_by) values (w, coalesce(p_note, ''), p_staff);
    added := added + 1;
  end loop;
  perform public.audit_add(p_staff, '허용 단어', '허용 단어 추가', jsonb_build_object('added', added, 'skipped', skipped, 'invalid', invalid), coalesce(p_note, ''));
  return jsonb_build_object('added', added, 'skipped', skipped, 'invalid', invalid);
end; $$;

create or replace function public.bo_allowed_remove(p_staff uuid, p_id bigint, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare w text;
begin
  update public.allowed_words set removed_at = now(), removed_by = p_staff where id = p_id and removed_at is null returning word into w;
  if w is null then raise exception 'word_not_found' using errcode = 'P0001'; end if;
  perform public.audit_add(p_staff, '허용 단어', '허용 단어 삭제', jsonb_build_object('id', p_id, 'word', w), p_reason);
end; $$;

-- 금칙어 방식 바꾸기(포함 ↔ 일치 ↔ 앞부분). 오탐이 확인되면 일치로(상세 13)
create or replace function public.bo_word_match(p_staff uuid, p_id bigint, p_match text, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare w public.banned_words;
begin
  if p_match not in ('contains', 'prefix', 'exact') then raise exception 'value_invalid' using errcode = 'P0001'; end if;
  select * into w from public.banned_words where id = p_id and removed_at is null for update;
  if not found then raise exception 'word_not_found' using errcode = 'P0001'; end if;
  if w.match = p_match then return; end if;
  if exists (select 1 from public.banned_words where removed_at is null and id <> p_id and private.norm_name(word) = private.norm_name(w.word) and match = p_match) then
    raise exception 'word_exists' using errcode = 'P0001';
  end if;
  update public.banned_words set match = p_match where id = p_id;
  perform public.audit_add(p_staff, '금칙어', '금칙어 방식 변경', jsonb_build_object('id', p_id, 'word', w.word, 'from', w.match, 'to', p_match), p_reason);
end; $$;

do $$
begin
  execute 'alter table public.allowed_words enable row level security';
  execute 'revoke all on table public.allowed_words from anon, authenticated';
  execute 'grant all on table public.allowed_words to service_role';
end $$;
revoke execute on function public.name_matches(text) from public, anon, authenticated;
grant execute on function public.name_matches(text) to service_role;
revoke execute on function public.bo_allowed(text) from public, anon, authenticated;
grant execute on function public.bo_allowed(text) to service_role;
revoke execute on function public.bo_allowed_bulk(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.bo_allowed_bulk(uuid, jsonb, text) to service_role;
revoke execute on function public.bo_allowed_remove(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.bo_allowed_remove(uuid, bigint, text) to service_role;
revoke execute on function public.bo_word_match(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.bo_word_match(uuid, bigint, text, text) to service_role;
commit;
