-- Prijsvergelijker: eenmalig uitvoeren in Supabase > SQL Editor.
-- Alle gegevens staan als documenten in één tabel; alleen ingelogde gebruikers hebben toegang.

create table if not exists public.docs (
  kind       text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

alter table public.docs enable row level security;

drop policy if exists "ingelogde gebruikers lezen"     on public.docs;
drop policy if exists "ingelogde gebruikers schrijven" on public.docs;

create policy "ingelogde gebruikers lezen"     on public.docs for select to authenticated using (true);
create policy "ingelogde gebruikers schrijven" on public.docs for all    to authenticated using (true) with check (true);

-- Live updates tussen computers
alter publication supabase_realtime add table public.docs;
