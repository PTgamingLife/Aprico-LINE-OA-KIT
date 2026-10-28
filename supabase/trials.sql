create table public.line_oa_kit_trials (
 line_subject text primary key check(line_subject ~ '^U[0-9a-f]{32}$'),
 project_id uuid references public.line_oa_kit_designs(id),revision integer,config jsonb,
 menu_id text,version uuid,active boolean not null default false,
 operation_id uuid,lease_until timestamptz,next_apply_at timestamptz,
 pending_project uuid,pending_revision integer,pending_config jsonb,
 updated_at timestamptz not null default now()
);
create table public.line_oa_kit_trial_budget(id integer primary key check(id=1),window_start timestamptz not null,used integer not null default 0);
insert into public.line_oa_kit_trial_budget values(1,now(),0);
create table public.line_oa_kit_trial_events(event_id text primary key,line_subject text not null,created_at timestamptz not null default now());
create index line_oa_kit_trial_events_created on public.line_oa_kit_trial_events(created_at);
alter table public.line_oa_kit_trials enable row level security;
alter table public.line_oa_kit_trial_budget enable row level security;
alter table public.line_oa_kit_trial_events enable row level security;
revoke all on public.line_oa_kit_trials,public.line_oa_kit_trial_budget,public.line_oa_kit_trial_events from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_trials,public.line_oa_kit_trial_budget,public.line_oa_kit_trial_events to service_role;
create function public.line_oa_kit_begin_trial(p_subject text,p_project uuid,p_revision integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_designs%rowtype;t public.line_oa_kit_trials%rowtype;b public.line_oa_kit_trial_budget%rowtype;op uuid:=gen_random_uuid();cached boolean;
begin
 select * into d from public.line_oa_kit_designs where id=p_project and line_subject=p_subject;
 if not found then return jsonb_build_object('error','trial_project_not_found');end if;
 if d.revision<>p_revision then return jsonb_build_object('error','trial_revision_conflict');end if;
 insert into public.line_oa_kit_trials(line_subject) values(p_subject) on conflict do nothing;
 select * into t from public.line_oa_kit_trials where line_subject=p_subject for update;
 if t.lease_until>now() then return jsonb_build_object('error','trial_busy');end if;
 if t.next_apply_at>now() then return jsonb_build_object('error','trial_rate_limit');end if;
 cached:=t.menu_id is not null and t.config=d.config;
 if not cached then
  select * into b from public.line_oa_kit_trial_budget where id=1 for update;
  if b.window_start<=now()-interval '1 hour' then b.used:=0;b.window_start:=now();end if;
  if b.used>=30 then return jsonb_build_object('error','trial_platform_limit');end if;
  update public.line_oa_kit_trial_budget set used=b.used+1,window_start=b.window_start where id=1;
 end if;
 update public.line_oa_kit_trials set operation_id=op,lease_until=now()+interval '2 minutes',next_apply_at=now()+case when cached then interval '5 seconds' else interval '1 minute' end,pending_project=d.id,pending_revision=d.revision,pending_config=d.config where line_subject=p_subject;
 return jsonb_build_object('operation',op,'config',d.config,'cached',cached,'oldMenu',t.menu_id,'oldVersion',t.version,'oldActive',t.active);
end;$$;
create function public.line_oa_kit_finish_trial(p_subject text,p_operation uuid,p_menu text,p_version uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.line_oa_kit_trials set project_id=pending_project,revision=pending_revision,config=pending_config,menu_id=p_menu,version=p_version,active=true,operation_id=null,lease_until=null,pending_project=null,pending_revision=null,pending_config=null,updated_at=now() where line_subject=p_subject and operation_id=p_operation;
 return found;
end;$$;
revoke all on function public.line_oa_kit_begin_trial(text,uuid,integer),public.line_oa_kit_finish_trial(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.line_oa_kit_begin_trial(text,uuid,integer),public.line_oa_kit_finish_trial(text,uuid,text,uuid) to service_role;
