create table public.line_oa_kit_deployments (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.line_oa_kit_designs(id),
 build_job_id uuid not null unique references public.line_oa_kit_build_jobs(id),
 line_subject text not null,
 status text not null check(status in ('queued','running','awaiting_acceptance','failed','interrupted')),
 stage text not null default 'queued',
 target jsonb not null,
 app_url text,webhook_url text,commit_sha text,
 system_checks jsonb not null default '{}',
 user_checks jsonb not null default '{}',
 error_code text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index line_oa_kit_one_active_deployment on public.line_oa_kit_deployments(project_id) where status in ('queued','running');
create index line_oa_kit_deployments_owner on public.line_oa_kit_deployments(line_subject,project_id,created_at desc);
alter table public.line_oa_kit_deployments enable row level security;
revoke all on public.line_oa_kit_deployments from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_deployments to service_role;
create function public.line_oa_kit_begin_deployment(p_job uuid,p_subject text,p_target jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.line_oa_kit_build_jobs%rowtype; d public.line_oa_kit_designs%rowtype; a public.line_oa_kit_build_access%rowtype; x public.line_oa_kit_deployments%rowtype;
begin
 select * into j from public.line_oa_kit_build_jobs where id=p_job and line_subject=p_subject;
 if not found or j.status<>'draft_ready' then return jsonb_build_object('error','draft_required');end if;
 select * into d from public.line_oa_kit_designs where id=j.project_id and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','project_not_found');end if;
 select * into a from public.line_oa_kit_build_access where project_id=d.id and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','access_required');end if;
 if d.revision<>j.design_revision or a.setup_revision<>j.setup_revision then return jsonb_build_object('error','revision_conflict');end if;
 select * into x from public.line_oa_kit_deployments where build_job_id=j.id;
 if found then return jsonb_build_object('id',x.id,'created',false);end if;
 if exists(select 1 from public.line_oa_kit_deployments where project_id=d.id and status in ('queued','running')) then return jsonb_build_object('error','deployment_active');end if;
 insert into public.line_oa_kit_deployments(project_id,build_job_id,line_subject,status,target) values(d.id,j.id,p_subject,'queued',p_target) returning * into x;
 return jsonb_build_object('id',x.id,'created',true);
end;$$;
revoke all on function public.line_oa_kit_begin_deployment(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.line_oa_kit_begin_deployment(uuid,text,jsonb) to service_role;
