create table public.line_oa_kit_build_budget (
 id integer primary key check(id=1),
 limit_usd numeric(12,6) not null check(limit_usd>=0),
 reserved_usd numeric(12,6) not null default 0 check(reserved_usd>=0),
 spent_usd numeric(12,6) not null default 0 check(spent_usd>=0)
);
-- Small cumulative pilot ceiling, not a customer credit price or recurring allowance.
insert into public.line_oa_kit_build_budget(id,limit_usd) values(1,0.10);
create table public.line_oa_kit_build_jobs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.line_oa_kit_designs(id) on delete cascade,
 line_subject text not null,
 design_revision integer not null,
 setup_revision integer not null,
 status text not null check(status in ('queued','running','draft_ready','failed','interrupted')),
 snapshot jsonb not null,
 artifact jsonb,
 usage jsonb,
 error_code text,
 reserved_usd numeric(12,6) not null default 0.05,
 cost_usd numeric(12,6),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id,design_revision,setup_revision)
);
create unique index line_oa_kit_one_active_build on public.line_oa_kit_build_jobs(project_id) where status in ('queued','running');
create index line_oa_kit_jobs_owner on public.line_oa_kit_build_jobs(line_subject,created_at desc);
alter table public.line_oa_kit_build_budget enable row level security;
alter table public.line_oa_kit_build_jobs enable row level security;
revoke all on public.line_oa_kit_build_budget,public.line_oa_kit_build_jobs from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_build_budget,public.line_oa_kit_build_jobs to service_role;

create function public.line_oa_kit_begin_build(p_project uuid,p_subject text,p_design_revision integer,p_setup_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_designs%rowtype; a public.line_oa_kit_build_access%rowtype; j public.line_oa_kit_build_jobs%rowtype; budget public.line_oa_kit_build_budget%rowtype;
begin
 select * into d from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','project_not_found'); end if;
 select * into a from public.line_oa_kit_build_access where project_id=d.id and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','access_required'); end if;
 if d.revision<>p_design_revision or a.setup_revision<>p_setup_revision then return jsonb_build_object('error','revision_conflict'); end if;
 select * into j from public.line_oa_kit_build_jobs where project_id=d.id and design_revision=d.revision and setup_revision=a.setup_revision;
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'created',false); end if;
 select * into j from public.line_oa_kit_build_jobs where project_id=d.id and status in ('queued','running');
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'created',false); end if;
 select * into budget from public.line_oa_kit_build_budget where id=1 for update;
 if not found or budget.limit_usd-budget.spent_usd-budget.reserved_usd<0.05 then return jsonb_build_object('error','pilot_budget_exhausted'); end if;
 update public.line_oa_kit_build_budget set reserved_usd=reserved_usd+0.05 where id=1;
 insert into public.line_oa_kit_build_jobs(project_id,line_subject,design_revision,setup_revision,status,snapshot)
 values(d.id,p_subject,d.revision,a.setup_revision,'queued',jsonb_build_object('design',d.config,'setup',a.setup)) returning * into j;
 return jsonb_build_object('job_id',j.id,'status',j.status,'created',true);
end;$$;

create function public.line_oa_kit_finish_build(p_job uuid,p_artifact jsonb,p_usage jsonb,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.line_oa_kit_build_jobs%rowtype; cost numeric(12,6);
begin
 select * into j from public.line_oa_kit_build_jobs where id=p_job for update;
 if not found or j.status not in ('queued','running') then return false; end if;
 if p_error is null and (p_artifact is null or jsonb_typeof(p_artifact)<>'object' or octet_length(p_artifact::text)>500000) then raise exception 'invalid artifact'; end if;
 if p_error is null then
  cost=ceil((greatest(0,coalesce((p_usage->>'inputTokens')::numeric,0))*0.4+greatest(0,coalesce((p_usage->>'outputTokens')::numeric,0))*1.6))/1000000;
  if cost>j.reserved_usd then raise exception 'usage exceeds reservation'; end if;
 else
  -- A network timeout may have incurred upstream usage: hold the full reservation conservatively.
  cost=j.reserved_usd;
 end if;
 update public.line_oa_kit_build_budget set reserved_usd=reserved_usd-j.reserved_usd,spent_usd=spent_usd+cost where id=1;
 update public.line_oa_kit_build_jobs set status=case when p_error is null then 'draft_ready' else 'failed' end,artifact=p_artifact,usage=p_usage,error_code=p_error,cost_usd=cost,updated_at=now() where id=j.id;
 return true;
end;$$;
revoke all on function public.line_oa_kit_begin_build(uuid,text,integer,integer),public.line_oa_kit_finish_build(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.line_oa_kit_begin_build(uuid,text,integer,integer),public.line_oa_kit_finish_build(uuid,jsonb,jsonb,text) to service_role;
