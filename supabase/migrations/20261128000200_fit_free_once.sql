-- 「適合功能」: the first analysis of each account is free; this records that it was used.
create table if not exists public.line_oa_kit_fit_uses (
  line_subject text primary key check (line_subject ~ '^U[0-9a-f]{32}$'),
  used_at timestamptz not null default now()
);
alter table public.line_oa_kit_fit_uses enable row level security;
revoke all on public.line_oa_kit_fit_uses from public, anon, authenticated;
grant select, insert on public.line_oa_kit_fit_uses to service_role;
