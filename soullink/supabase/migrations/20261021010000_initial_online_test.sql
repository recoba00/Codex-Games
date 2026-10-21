begin;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Guest'
    check (char_length(display_name) between 1 and 24),
  preferred_character_id text
    check (preferred_character_id is null or char_length(preferred_character_id) between 1 and 64),
  preferred_skin_id text
    check (preferred_skin_id is null or char_length(preferred_skin_id) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_catalog (
  id text primary key check (id = 'published'),
  schema_version integer not null check (schema_version > 0),
  revision bigint not null check (revision >= 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_skins (
  user_id uuid not null references auth.users (id) on delete cascade,
  character_id text not null check (char_length(character_id) between 1 and 64),
  skin_id text not null check (char_length(skin_id) between 1 and 64),
  equipped boolean not null default false,
  granted_at timestamptz not null default now(),
  primary key (user_id, character_id, skin_id)
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  room_id text not null unique check (char_length(room_id) between 8 and 64),
  player_one_id uuid not null references auth.users (id) on delete restrict,
  player_two_id uuid not null references auth.users (id) on delete restrict,
  winner_id uuid references auth.users (id) on delete restrict,
  finish_reason text not null
    check (finish_reason in ('completed', 'forfeit', 'timeout', 'cancelled')),
  final_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(final_state) = 'object'),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (player_one_id <> player_two_id),
  check (winner_id is null or winner_id in (player_one_id, player_two_id)),
  check (ended_at >= started_at)
);

create index if not exists match_results_player_one_created_idx
  on public.match_results (player_one_id, created_at desc);
create index if not exists match_results_player_two_created_idx
  on public.match_results (player_two_id, created_at desc);
create index if not exists user_skins_user_idx
  on public.user_skins (user_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists game_catalog_set_updated_at on public.game_catalog;
create trigger game_catalog_set_updated_at
before update on public.game_catalog
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Guest'), 24)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;

drop trigger if exists auth_user_created on auth.users;
create trigger auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.game_catalog enable row level security;
alter table public.user_skins enable row level security;
alter table public.match_results enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.game_catalog from anon, authenticated;
revoke all on table public.user_skins from anon, authenticated;
revoke all on table public.match_results from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select on table public.game_catalog to anon, authenticated;
grant select on table public.user_skins to authenticated;
grant select on table public.match_results to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.game_catalog to service_role;
grant all on table public.user_skins to service_role;
grant all on table public.match_results to service_role;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists game_catalog_public_read on public.game_catalog;
create policy game_catalog_public_read
on public.game_catalog for select
to anon, authenticated
using (true);

drop policy if exists user_skins_select_own on public.user_skins;
create policy user_skins_select_own
on public.user_skins for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists match_results_select_participant on public.match_results;
create policy match_results_select_participant
on public.match_results for select
to authenticated
using ((select auth.uid()) in (player_one_id, player_two_id));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'soullink-content',
  'soullink-content',
  true,
  8388608,
  array['image/webp', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists soullink_content_public_read on storage.objects;
create policy soullink_content_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'soullink-content');

commit;
