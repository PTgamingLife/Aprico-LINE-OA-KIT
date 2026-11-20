-- Cross-account links between OA apps. Aprico pairs and relays; message text is sealed
-- end-to-end for the receiving app, so only metadata is kept here.
create table if not exists public.line_oa_kit_links (
  id uuid primary key default gen_random_uuid(),
  a_project uuid not null,
  b_project uuid,
  a_label text not null check (length(a_label) between 1 and 20),
  b_label text check (b_label is null or length(b_label) between 1 and 20),
  a_key text not null,
  b_key text,
  a_inbox text not null,
  b_inbox text,
  a_scope jsonb not null default '{}'::jsonb,
  b_scope jsonb,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  code_hash text unique,
  code_expires timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  check (b_project is null or b_project <> a_project)
);
create index if not exists line_oa_kit_links_a_idx on public.line_oa_kit_links (a_project);
create index if not exists line_oa_kit_links_b_idx on public.line_oa_kit_links (b_project);

-- Sealed messages waiting for the receiving app; deleted once it confirms delivery.
create table if not exists public.line_oa_kit_link_queue (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.line_oa_kit_links (id) on delete cascade,
  to_project uuid not null,
  from_project uuid,
  from_label text not null,
  kind text not null check (kind in ('manual', 'events', 'todos', 'expenses', 'notices', 'accepted', 'revoked')),
  sealed text check (sealed is null or length(sealed) <= 12000),
  created_at timestamptz not null default now()
);
create index if not exists line_oa_kit_link_queue_to_idx
  on public.line_oa_kit_link_queue (to_project, created_at);

-- Metadata only: which link, which way, what kind, what happened.
create table if not exists public.line_oa_kit_link_log (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null,
  project_id uuid not null,
  direction text not null check (direction in ('a2b', 'b2a', 'in')),
  kind text not null,
  status text not null check (status in ('queued', 'delivered', 'refused', 'limit')),
  at timestamptz not null default now()
);
create index if not exists line_oa_kit_link_log_daily_idx
  on public.line_oa_kit_link_log (link_id, direction, status, at);
create index if not exists line_oa_kit_link_log_project_idx
  on public.line_oa_kit_link_log (project_id, status, at);

alter table public.line_oa_kit_links enable row level security;
alter table public.line_oa_kit_link_queue enable row level security;
alter table public.line_oa_kit_link_log enable row level security;
revoke all on public.line_oa_kit_links, public.line_oa_kit_link_queue, public.line_oa_kit_link_log
  from public, anon, authenticated;
grant select, insert, update, delete on public.line_oa_kit_links, public.line_oa_kit_link_queue,
  public.line_oa_kit_link_log to service_role;

-- Undelivered sealed messages are dropped after 7 days.
select cron.schedule('aprico-link-queue-purge', '17 3 * * *',
  $$delete from public.line_oa_kit_link_queue where created_at < now() - interval '7 days'$$);
