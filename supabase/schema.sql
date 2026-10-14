-- =====================================================================
-- Cantoral — esquema de base de datos para Supabase
-- Ejecuta TODO este archivo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: puedes volver a ejecutarlo sin romper nada.
-- =====================================================================

-- 1) Tabla de canciones ------------------------------------------------
create table if not exists public.songs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  lyrics      text not null default '',
  raw_text    text,                                   -- texto OCR original (con acordes), por si hay que re-limpiar
  image_paths text[] not null default '{}',           -- rutas en Storage (bucket "scans")
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists songs_user_title_idx on public.songs (user_id, title);
create index if not exists songs_user_updated_idx on public.songs (user_id, updated_at desc);

-- 2) updated_at automático --------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at
  before update on public.songs
  for each row execute function public.set_updated_at();

-- 3) Seguridad: cada usuario solo ve y modifica sus canciones ----------
alter table public.songs enable row level security;

drop policy if exists "songs_select_own" on public.songs;
drop policy if exists "songs_insert_own" on public.songs;
drop policy if exists "songs_update_own" on public.songs;
drop policy if exists "songs_delete_own" on public.songs;

create policy "songs_select_own" on public.songs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "songs_insert_own" on public.songs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "songs_update_own" on public.songs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "songs_delete_own" on public.songs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 4) Sincronización en tiempo real entre dispositivos ------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'songs'
  ) then
    alter publication supabase_realtime add table public.songs;
  end if;
end $$;

-- 5) Almacenamiento de imágenes escaneadas (bucket privado) -----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cada usuario solo accede a su carpeta: scans/<user_id>/...
drop policy if exists "scans_select_own" on storage.objects;
drop policy if exists "scans_insert_own" on storage.objects;
drop policy if exists "scans_update_own" on storage.objects;
drop policy if exists "scans_delete_own" on storage.objects;

create policy "scans_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scans_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scans_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scans_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
