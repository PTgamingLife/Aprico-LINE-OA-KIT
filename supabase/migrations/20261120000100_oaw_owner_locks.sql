-- Emergency lock for a customer's OA app. Anyone signed in as the owner may lock (it only
-- makes things safer); unlocking needs the GitHub App on the customer's repo, which a
-- stolen LINE account does not give. The app reads the flag through /status.
create table if not exists public.line_oa_kit_owner_locks (
  project_id uuid primary key,
  source text not null check (source in ('chat', 'page')),
  locked_at timestamptz not null default now()
);
alter table public.line_oa_kit_owner_locks enable row level security;
revoke all on public.line_oa_kit_owner_locks from public, anon, authenticated;
grant select, insert, update, delete on public.line_oa_kit_owner_locks to service_role;
