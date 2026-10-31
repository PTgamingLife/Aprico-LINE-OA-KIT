-- Read-only LINE eligibility probe. No message sending or recurring job.
create table public.line_oa_kit_onboarding_probes (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 expires_at timestamptz not null,
 result jsonb,
 created_at timestamptz not null default now(),
 claimed_at timestamptz
);
alter table public.line_oa_kit_onboarding_probes enable row level security;
revoke all on public.line_oa_kit_onboarding_probes from public, anon, authenticated;
grant all on public.line_oa_kit_onboarding_probes to service_role;
