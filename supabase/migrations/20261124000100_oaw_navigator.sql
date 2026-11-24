-- 領航者版 (the business tier of an OAW app). Aprico issues a one-time unlock code for one
-- project; the owner types it in their own OA chat and the app redeems it with its own key.
-- Only the hash of a code is stored.
create table if not exists public.line_oa_kit_navigator_codes (
  code_hash text primary key,
  project_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists line_oa_kit_navigator_codes_project_idx
  on public.line_oa_kit_navigator_codes (project_id);

create table if not exists public.line_oa_kit_navigator (
  project_id uuid primary key,
  since timestamptz not null default now()
);

alter table public.line_oa_kit_navigator_codes enable row level security;
alter table public.line_oa_kit_navigator enable row level security;
revoke all on public.line_oa_kit_navigator_codes, public.line_oa_kit_navigator
  from public, anon, authenticated;
grant select, update on public.line_oa_kit_navigator_codes to service_role;
grant select, insert on public.line_oa_kit_navigator to service_role;

-- Operator only: make a code for one project, valid 7 days. Returns the code once.
create schema if not exists line_oa_kit_internal;
create or replace function line_oa_kit_internal.issue_navigator_code(p_project uuid)
returns text language plpgsql set search_path = '' as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; raw bytea; code text := ''; i int;
begin
  raw := extensions.gen_random_bytes(12);
  for i in 0..11 loop
    code := code || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;
  insert into public.line_oa_kit_navigator_codes (code_hash, project_id, expires_at)
    values (encode(extensions.digest(code, 'sha256'), 'hex'), p_project, now() + interval '7 days');
  return substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4);
end;
$$;
revoke all on function line_oa_kit_internal.issue_navigator_code(uuid) from public, anon, authenticated;
