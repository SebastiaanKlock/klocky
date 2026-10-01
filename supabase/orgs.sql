-- Organisaties: elk bedrijf ziet alleen zijn eigen gegevens. Eenmalig uitvoeren in Supabase > SQL Editor.

-- 1. Oude (gedeelde) tabel veiligstellen; hij wordt dichtgezet en kan met claim_legacy() worden overgezet.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'docs')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'docs' and column_name = 'org_id') then
    alter table public.docs rename to docs_legacy;
    alter index if exists public.docs_pkey rename to docs_legacy_pkey;
    drop policy if exists "ingelogde gebruikers lezen" on public.docs_legacy;
    drop policy if exists "ingelogde gebruikers schrijven" on public.docs_legacy;
    alter table public.docs_legacy enable row level security;
  end if;
end $$;

-- 2. Organisaties en leden
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  org_id  uuid not null references public.orgs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  email   text,
  role    text not null default 'member' check (role in ('owner', 'member')),
  primary key (org_id, user_id)
);

-- 3. Gegevens per organisatie
create table if not exists public.docs (
  org_id     uuid not null references public.orgs on delete cascade,
  kind       text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, kind, id)
);

-- 4. Hulpfuncties (security definer, zodat de beleidsregels elkaar niet in de weg zitten)
create or replace function public.is_member(p_org uuid) returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from public.members where org_id = p_org and user_id = auth.uid()) $$;

create or replace function public.is_owner(p_org uuid) returns boolean
language sql security definer set search_path = public stable as
$$ select exists (select 1 from public.members where org_id = p_org and user_id = auth.uid() and role = 'owner') $$;

create or replace function public.create_org(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Geef de organisatie een naam'; end if;
  insert into public.orgs (name) values (trim(p_name)) returning id into v_id;
  insert into public.members (org_id, user_id, email, role) values (v_id, auth.uid(), auth.jwt() ->> 'email', 'owner');
  return v_id;
end $$;

create or replace function public.join_org(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  select id into v_id from public.orgs where invite_code = lower(trim(p_code));
  if v_id is null then raise exception 'Deze uitnodigingscode klopt niet'; end if;
  insert into public.members (org_id, user_id, email, role) values (v_id, auth.uid(), auth.jwt() ->> 'email', 'member')
    on conflict do nothing;
  return v_id;
end $$;

create or replace function public.rotate_invite(p_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
begin
  if not public.is_owner(p_org) then raise exception 'Alleen de eigenaar kan dit'; end if;
  update public.orgs set invite_code = v_code where id = p_org;
  return v_code;
end $$;

create or replace function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- de eigenaar mag iedereen verwijderen; iedereen mag zichzelf verwijderen (behalve de laatste eigenaar)
  if not (public.is_owner(p_org) or p_user = auth.uid()) then raise exception 'Niet toegestaan'; end if;
  if exists (select 1 from public.members where org_id = p_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'De enige eigenaar kan niet worden verwijderd';
  end if;
  delete from public.members where org_id = p_org and user_id = p_user;
end $$;

-- Oude gegevens (van vóór de organisaties) overzetten naar je eigen organisatie, eenmalig door de eigenaar
create or replace function public.claim_legacy(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer := 0;
begin
  if not public.is_owner(p_org) then raise exception 'Alleen de eigenaar kan dit'; end if;
  if to_regclass('public.docs_legacy') is null then return 0; end if;
  insert into public.docs (org_id, kind, id, data, updated_at)
    select p_org, kind, id, data, updated_at from public.docs_legacy
    on conflict do nothing;
  get diagnostics v_n = row_count;
  drop table public.docs_legacy;
  return v_n;
end $$;

-- 5. Beveiliging
alter table public.orgs    enable row level security;
alter table public.members enable row level security;
alter table public.docs    enable row level security;

drop policy if exists "eigen organisatie" on public.orgs;
create policy "eigen organisatie" on public.orgs for select to authenticated using (public.is_member(id));
drop policy if exists "eigenaar hernoemt" on public.orgs;
create policy "eigenaar hernoemt" on public.orgs for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

drop policy if exists "collegas zien" on public.members;
create policy "collegas zien" on public.members for select to authenticated using (public.is_member(org_id));

drop policy if exists "eigen gegevens" on public.docs;
create policy "eigen gegevens" on public.docs for all to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));

revoke all on public.orgs, public.members, public.docs from anon;
revoke execute on function public.create_org, public.join_org, public.rotate_invite, public.remove_member, public.claim_legacy, public.is_member, public.is_owner from public, anon;
grant execute on function public.create_org, public.join_org, public.rotate_invite, public.remove_member, public.claim_legacy, public.is_member, public.is_owner to authenticated;

-- 6. Live updates
do $$ begin
  begin alter publication supabase_realtime add table public.docs; exception when duplicate_object then null; end;
end $$;
