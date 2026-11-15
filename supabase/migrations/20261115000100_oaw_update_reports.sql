-- Template update outcomes, for the company to review conflicts. No personal data:
-- project_hash is sha256('oaw-update:' || project id); no repo name, LINE id or content.
create table if not exists public.line_oa_kit_update_reports (
  id uuid primary key default gen_random_uuid(),
  project_hash text not null check (project_hash ~ '^[0-9a-f]{64}$'),
  version text not null check (version ~ '^[0-9.]{8,20}$'),
  kind text not null check (kind in ('applied', 'modified', 'deleted')),
  path text check (path is null or (length(path) <= 300 and path !~ '\.\.')),
  choice text check (choice is null or choice in ('keep', 'take')),
  changes integer,
  created_at timestamptz not null default now()
);
create index if not exists line_oa_kit_update_reports_version_idx
  on public.line_oa_kit_update_reports (version, kind);
alter table public.line_oa_kit_update_reports enable row level security;
revoke all on public.line_oa_kit_update_reports from public, anon, authenticated;
grant select, insert on public.line_oa_kit_update_reports to service_role;
