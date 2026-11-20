-- One-use ticks for line-oa-kit-menu-setup (publish the Aprico OA rich menus).
-- Run: select line_oa_kit_internal.invoke_menu_setup();  then read net._http_response.
create schema if not exists line_oa_kit_internal;
create table if not exists public.line_oa_kit_menu_ticks (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.line_oa_kit_menu_ticks enable row level security;
revoke all on public.line_oa_kit_menu_ticks from public, anon, authenticated;
grant select, delete on public.line_oa_kit_menu_ticks to service_role;

create or replace function line_oa_kit_internal.invoke_menu_setup()
returns bigint language plpgsql set search_path = '' as $$
declare k text; request bigint;
begin
  delete from public.line_oa_kit_menu_ticks where created_at < now() - interval '1 day';
  k := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.line_oa_kit_menu_ticks (token_hash, expires_at)
    values (encode(extensions.digest(k, 'sha256'), 'hex'), now() + interval '90 seconds');
  select net.http_post(
    url := 'https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-menu-setup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-menu-tick', k),
    body := '{}'::jsonb, timeout_milliseconds := 120000) into request;
  return request;
end;
$$;
revoke all on function line_oa_kit_internal.invoke_menu_setup() from public, anon, authenticated;
