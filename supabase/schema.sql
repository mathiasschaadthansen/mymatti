-- Mymatti gemmer hele husstandens data som ét JSON-dokument.
create table if not exists public.mymatti_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Ingen policies og ingen rettigheder til anon/authenticated:
-- kun appens server (service_role-nøglen) kan læse og skrive.
alter table public.mymatti_state enable row level security;
revoke all on public.mymatti_state from anon, authenticated;
