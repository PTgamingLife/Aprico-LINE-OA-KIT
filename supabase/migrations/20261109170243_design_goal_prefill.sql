create table public.line_oa_kit_build_prefills (
 project_id uuid primary key references public.line_oa_kit_designs(id) on delete cascade,
 claim uuid not null,
 design_revision integer not null,
 attempts integer not null check(attempts between 1 and 3),
 status text not null check(status in ('running','done','failed')),
 updated_at timestamptz not null default now()
);
alter table public.line_oa_kit_build_prefills enable row level security;
revoke all on public.line_oa_kit_build_prefills from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_build_prefills to service_role;

create function public.line_oa_kit_begin_prefill(p_project uuid,p_subject text,p_revision integer,p_retry boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 d public.line_oa_kit_designs%rowtype;
 a public.line_oa_kit_build_access%rowtype;
 j public.line_oa_kit_build_prefills%rowtype;
 budget public.line_oa_kit_build_budget%rowtype;
 claim_id uuid:=gen_random_uuid();
begin
 select * into d from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found or d.revision is distinct from p_revision then return jsonb_build_object('status','stale'); end if;
 select * into a from public.line_oa_kit_build_access where project_id=p_project and line_subject=p_subject for update;
 if not found or (a.grant_method='line_pay' and d.confirmed_revision is distinct from d.revision) then return jsonb_build_object('status','locked'); end if;
 if not exists(select 1 from unnest(array['audience','purpose','scenario','success','failure','human']) k
  where btrim(coalesce(a.setup->>k,''))='') then return jsonb_build_object('status','done'); end if;
 select * into j from public.line_oa_kit_build_prefills where project_id=p_project for update;
 if j.status='done' then return jsonb_build_object('status','done'); end if;
 if j.status='running' and j.updated_at>now()-interval '2 minutes' then return jsonb_build_object('status','running'); end if;
 select * into budget from public.line_oa_kit_build_budget where id=1 for update;
 if j.status='running' then
  update public.line_oa_kit_build_budget set reserved_usd=reserved_usd-0.01,spent_usd=spent_usd+0.01 where id=1;
  update public.line_oa_kit_build_prefills set status='failed',updated_at=now() where project_id=p_project;
  budget.reserved_usd:=budget.reserved_usd-0.01;
  budget.spent_usd:=budget.spent_usd+0.01;
 end if;
 if j.attempts>=3 then return jsonb_build_object('status','exhausted'); end if;
 if j.attempts is not null and p_retry is not true then return jsonb_build_object('status','failed'); end if;
 if budget.id is null or budget.limit_usd-budget.spent_usd-budget.reserved_usd<0.01 then return jsonb_build_object('status','budget'); end if;
 update public.line_oa_kit_build_budget set reserved_usd=reserved_usd+0.01 where id=1;
 insert into public.line_oa_kit_build_prefills(project_id,claim,design_revision,attempts,status)
 values(p_project,claim_id,p_revision,1,'running')
 on conflict(project_id) do update set claim=excluded.claim,design_revision=excluded.design_revision,
  attempts=line_oa_kit_build_prefills.attempts+1,status='running',updated_at=now();
 return jsonb_build_object('status','running','claim',claim_id);
end;
$$;

create function public.line_oa_kit_finish_prefill(p_project uuid,p_subject text,p_claim uuid,p_values jsonb,p_cost_usd numeric)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
 d public.line_oa_kit_designs%rowtype;
 a public.line_oa_kit_build_access%rowtype;
 j public.line_oa_kit_build_prefills%rowtype;
 merged jsonb;
 field text;
 applicable boolean;
begin
 select * into d from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then return false; end if;
 select * into a from public.line_oa_kit_build_access where project_id=p_project and line_subject=p_subject for update;
 select * into j from public.line_oa_kit_build_prefills where project_id=p_project and claim=p_claim and status='running' for update;
 if not found then return false; end if;
 update public.line_oa_kit_build_budget set reserved_usd=reserved_usd-0.01,spent_usd=spent_usd+greatest(0,coalesce(p_cost_usd,0.01)) where id=1;
 applicable:=a.project_id is not null and d.revision=j.design_revision and p_values is not null
  and (a.grant_method<>'line_pay' or d.confirmed_revision=d.revision);
 if applicable is true then
  merged:=case when a.setup_revision=0 then
   '{"audience":"","purpose":"","scenario":"","success":"","failure":"","human":"","githubRepo":"","supabaseUrl":"","messagingChannelId":"","contactUrl":"","runtimeAiProvider":"none"}'::jsonb
   else a.setup end;
  foreach field in array array['audience','purpose','scenario','success','failure','human'] loop
   if btrim(coalesce(merged->>field,''))='' and jsonb_typeof(p_values->field)='string' and length(p_values->>field) between 1 and 600 then
    merged:=jsonb_set(merged,array[field],p_values->field);
   end if;
  end loop;
  if merged is distinct from a.setup then
   update public.line_oa_kit_build_access set setup=merged,setup_revision=setup_revision+1,updated_at=now() where project_id=p_project and line_subject=p_subject;
  end if;
 end if;
 update public.line_oa_kit_build_prefills set status=case when applicable is true then 'done' else 'failed' end,updated_at=now() where project_id=p_project;
 return applicable is true;
end;
$$;
revoke all on function public.line_oa_kit_begin_prefill(uuid,text,integer,boolean),public.line_oa_kit_finish_prefill(uuid,text,uuid,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.line_oa_kit_begin_prefill(uuid,text,integer,boolean),public.line_oa_kit_finish_prefill(uuid,text,uuid,jsonb,numeric) to service_role;
