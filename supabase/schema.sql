-- Execute no SQL Editor do Supabase (Dashboard → SQL → New query)

create table if not exists public.loteamento_snapshot (
  id text primary key default 'main',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.loteamento_snapshot enable row level security;

drop policy if exists "loteamento_anon_all" on public.loteamento_snapshot;
create policy "loteamento_anon_all"
  on public.loteamento_snapshot
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Opcional: habilitar Realtime (Database → Replication → loteamento_snapshot)
-- alter publication supabase_realtime add table loteamento_snapshot;
