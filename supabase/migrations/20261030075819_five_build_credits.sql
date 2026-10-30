alter table public.line_oa_kit_build_access add column build_limit integer not null default 5 check(build_limit>=0);

create function public.line_oa_kit_build_credits(p_project uuid,p_subject text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare allowance integer; used integer; pending integer;
begin
 select build_limit into allowance from public.line_oa_kit_build_access where project_id=p_project and line_subject=p_subject;
 if not found then return jsonb_build_object('error','access_required'); end if;
 select count(*) filter(where status='draft_ready'),count(*) filter(where status in ('queued','running')) into used,pending
 from public.line_oa_kit_build_jobs where project_id=p_project and line_subject=p_subject;
 return jsonb_build_object('limit',allowance,'used',used,'pending',pending,'remaining',greatest(0,allowance-used-pending));
end;$$;

create or replace function public.line_oa_kit_begin_build(p_project uuid,p_subject text,p_design_revision integer,p_setup_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_designs%rowtype; a public.line_oa_kit_build_access%rowtype; j public.line_oa_kit_build_jobs%rowtype; budget public.line_oa_kit_build_budget%rowtype;
begin
 select * into d from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','project_not_found'); end if;
 select * into a from public.line_oa_kit_build_access where project_id=d.id and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','access_required'); end if;
 if d.revision is distinct from p_design_revision or a.setup_revision is distinct from p_setup_revision then return jsonb_build_object('error','revision_conflict'); end if;
 -- Idempotent reads of an existing version never consume another credit.
 select * into j from public.line_oa_kit_build_jobs where project_id=d.id and design_revision=d.revision and setup_revision=a.setup_revision;
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'created',false); end if;
 select * into j from public.line_oa_kit_build_jobs where project_id=d.id and status in ('queued','running');
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'created',false); end if;
 if (select count(*) from public.line_oa_kit_build_jobs where project_id=d.id and line_subject=p_subject and status in ('draft_ready','queued','running'))>=a.build_limit then return jsonb_build_object('error','build_credits_exhausted'); end if;
 select * into budget from public.line_oa_kit_build_budget where id=1 for update;
 if not found or budget.limit_usd-budget.spent_usd-budget.reserved_usd<0.05 then return jsonb_build_object('error','pilot_budget_exhausted'); end if;
 update public.line_oa_kit_build_budget set reserved_usd=reserved_usd+0.05 where id=1;
 insert into public.line_oa_kit_build_jobs(project_id,line_subject,design_revision,setup_revision,status,snapshot)
 values(d.id,p_subject,d.revision,a.setup_revision,'queued',jsonb_build_object('design',d.config,'setup',a.setup)) returning * into j;
 return jsonb_build_object('job_id',j.id,'status',j.status,'created',true);
end;$$;
revoke all on function public.line_oa_kit_build_credits(uuid,text),public.line_oa_kit_begin_build(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.line_oa_kit_build_credits(uuid,text),public.line_oa_kit_begin_build(uuid,text,integer,integer) to service_role;
