-- One-time codes that connect a customer's own OA app (OAW template) to their Aprico
-- subscription. The owner asks in the Aprico OA, sends the code in their own OA, and that
-- OA trades it for a runtime key. Only the code's SHA-256 digest is stored.
create table if not exists public.line_oa_kit_connect_codes (
  code_digest text primary key check (code_digest ~ '^[a-f0-9]{64}$'),
  line_subject text not null,
  project_id uuid not null references public.line_oa_kit_designs(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists line_oa_kit_connect_codes_owner_idx
  on public.line_oa_kit_connect_codes (line_subject, created_at desc);

alter table public.line_oa_kit_connect_codes enable row level security;
revoke all on public.line_oa_kit_connect_codes from public, anon, authenticated;
grant select, insert, update, delete on public.line_oa_kit_connect_codes to service_role;
