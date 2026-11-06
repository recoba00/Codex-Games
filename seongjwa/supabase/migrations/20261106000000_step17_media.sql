-- 17단계: 대사 음성·스킬 애니메이션(기획지시 2026-11-06 캐릭터등록단순화). 에셋 버킷에 음성(ogg·mp3)·투명 영상(WebM) 허용, 파일 상한 2MB → 8MB.
-- 이미지 2MB·음성 1MB·영상 8MB 상한은 서버가 종류별로 다시 막는다(src/assets.mjs). 무료 플랜 저장소 1GB 안.
do $$ begin
  if to_regclass('storage.buckets') is not null then  -- 로컬 시험 DB에는 storage 스키마가 없다
    update storage.buckets set file_size_limit = 8388608, allowed_mime_types = array['image/webp', 'audio/ogg', 'audio/mpeg', 'video/webm'] where id = 'assets';
  end if;
end $$;
-- 에셋 표 키: 스킬 애니메이션(anim), 대사 텍스트(line_슬롯), 대사 음성(voice_슬롯) 추가. 얼굴 파일(face) 키는 옛 값 보관용으로 남김
alter table public.asset_files drop constraint if exists asset_files_key_check;
alter table public.asset_files add constraint asset_files_key_check check (key ~ '^(slot:[A-Z][A-Z0-9_]{1,47}|art:[A-Z]{2,3}:[0-9]{3}:(full|thumb|face|regions|anim|(line|voice)_(ACTIVE_01|ACTIVE_02|PICK|WIN|LOSE)))$');
