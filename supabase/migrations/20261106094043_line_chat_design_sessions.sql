create table public.line_oa_kit_chat_design_sessions (
  line_subject text primary key,
  revision uuid not null,
  state jsonb not null,
  last_event text not null,
  updated_at timestamptz not null default now()
);
alter table public.line_oa_kit_chat_design_sessions enable row level security;
revoke all on public.line_oa_kit_chat_design_sessions from anon, authenticated;
grant select, insert, update on public.line_oa_kit_chat_design_sessions to service_role;
