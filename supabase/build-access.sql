-- Separate teaching/build entitlement from design content and future payment records.
create table public.line_oa_kit_build_access (
 project_id uuid primary key references public.line_oa_kit_designs(id) on delete cascade,
 line_subject text not null check(line_subject ~ '^U[0-9a-f]{32}$'),
 granted_at timestamptz not null default now(),
 grant_method text not null check(grant_method in ('manual_password','line_pay')),
 setup jsonb not null default '{}'::jsonb check(jsonb_typeof(setup)='object' and octet_length(setup::text)<40000),
 setup_revision integer not null default 0 check(setup_revision>=0),
 updated_at timestamptz not null default now()
);
create index line_oa_kit_build_access_owner on public.line_oa_kit_build_access(line_subject);
alter table public.line_oa_kit_build_access enable row level security;
revoke all on public.line_oa_kit_build_access from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_build_access to service_role;
create table public.line_oa_kit_unlock_limits (
 line_subject text primary key,
 window_start timestamptz not null,
 attempts integer not null check(attempts>0)
);
alter table public.line_oa_kit_unlock_limits enable row level security;
revoke all on public.line_oa_kit_unlock_limits from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_unlock_limits to service_role;
create function public.line_oa_kit_consume_unlock_attempt(p_subject text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 if p_subject !~ '^U[0-9a-f]{32}$' then return false; end if;
 insert into public.line_oa_kit_unlock_limits as limits(line_subject,window_start,attempts)
 values(p_subject,now(),1)
 on conflict(line_subject) do update set
 attempts=case when limits.window_start<=now()-interval '15 minutes' then 1 else least(limits.attempts+1,1000) end,
 window_start=case when limits.window_start<=now()-interval '15 minutes' then now() else limits.window_start end
 returning attempts into used;
 return used<=5;
end;$$;
revoke all on function public.line_oa_kit_consume_unlock_attempt(text) from public,anon,authenticated;
grant execute on function public.line_oa_kit_consume_unlock_attempt(text) to service_role;
