alter table public.line_oa_kit_payments drop constraint line_oa_kit_payments_amount_check;
alter table public.line_oa_kit_payments add constraint line_oa_kit_payments_amount_check check(amount in (1680,1890,3860));

create table public.line_oa_kit_points_wallets (
 line_subject text primary key,
 balance numeric(16,6) not null check(balance>=0)
);

create table public.line_oa_kit_ai_rates (
 version integer primary key,
 usd_to_twd numeric(10,6) not null check(usd_to_twd>0 and usd_to_twd<=100),
 created_at timestamptz not null default now()
);

create table public.line_oa_kit_ai_usage (
 request_id text primary key,
 project_id uuid not null references public.line_oa_kit_designs(id),
 line_subject text not null references public.line_oa_kit_points_wallets(line_subject),
 purpose text not null check(purpose in ('build','review','runtime')),
 rate_version integer not null references public.line_oa_kit_ai_rates(version),
 usd_to_twd numeric(10,6) not null,
 reserved_usd numeric(12,6) not null check(reserved_usd>0),
 reserved_points numeric(16,6) not null check(reserved_points>0),
 used_points numeric(16,6) check(used_points between 0 and reserved_points),
 usage jsonb,
 created_at timestamptz not null default now()
);
create index line_oa_kit_ai_usage_owner_idx on public.line_oa_kit_ai_usage(line_subject,created_at desc);

alter table public.line_oa_kit_points_wallets enable row level security;
alter table public.line_oa_kit_ai_rates enable row level security;
alter table public.line_oa_kit_ai_usage enable row level security;
revoke all on public.line_oa_kit_points_wallets,public.line_oa_kit_ai_rates,public.line_oa_kit_ai_usage from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_points_wallets,public.line_oa_kit_ai_usage to service_role;
grant select on public.line_oa_kit_ai_rates to service_role;

create function public.line_oa_kit_credit_points()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.line_oa_kit_points_wallets(line_subject,balance) values(new.line_subject,1680)
 on conflict(line_subject) do update set balance=line_oa_kit_points_wallets.balance+1680;
 return new;
end;
$$;
create trigger line_oa_kit_credit_paid_order after update of status on public.line_oa_kit_payments
 for each row when(new.status='paid' and old.status<>'paid' and new.environment='production' and new.amount=1680)
 execute function public.line_oa_kit_credit_points();

create function public.line_oa_kit_reserve_ai(p_request text,p_project uuid,p_subject text,p_purpose text,p_max_usd numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 rate public.line_oa_kit_ai_rates%rowtype;
 available numeric;
 held numeric;
 budget public.line_oa_kit_build_budget%rowtype;
begin
 if p_request is null or length(p_request)>160 or p_max_usd is null or p_max_usd<=0 or p_max_usd>0.05 then
  return jsonb_build_object('error','invalid_reservation');
 end if;
 if not exists(select 1 from public.line_oa_kit_payments where project_id=p_project and line_subject=p_subject and status='paid' and environment='production' and amount=1680) then
  return jsonb_build_object('error','points_plan_required');
 end if;
 select * into rate from public.line_oa_kit_ai_rates order by version desc limit 1;
 if not found then return jsonb_build_object('error','points_rate_missing'); end if;
 if p_purpose<>'build' then
  select * into budget from public.line_oa_kit_build_budget where id=1 for update;
  if not found or budget.limit_usd-budget.spent_usd-budget.reserved_usd<p_max_usd then
   return jsonb_build_object('error','pilot_budget_exhausted');
  end if;
 end if;
 select balance into available from public.line_oa_kit_points_wallets where line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','points_wallet_missing'); end if;
 if exists(select 1 from public.line_oa_kit_ai_usage where request_id=p_request) then
  return jsonb_build_object('error','points_request_exists');
 end if;
 held=round(p_max_usd*rate.usd_to_twd*10,6);
 if available<held then return jsonb_build_object('error','points_insufficient'); end if;
 insert into public.line_oa_kit_ai_usage(request_id,project_id,line_subject,purpose,rate_version,usd_to_twd,reserved_usd,reserved_points)
 values(p_request,p_project,p_subject,p_purpose,rate.version,rate.usd_to_twd,p_max_usd,held);
 update public.line_oa_kit_points_wallets set balance=balance-held where line_subject=p_subject;
 if p_purpose<>'build' then update public.line_oa_kit_build_budget set reserved_usd=reserved_usd+p_max_usd where id=1; end if;
 return jsonb_build_object('reserved',held,'balance',available-held);
end;
$$;

create function public.line_oa_kit_settle_ai(p_request text,p_usage jsonb)
returns numeric language plpgsql security invoker set search_path='' as $$
declare
 entry public.line_oa_kit_ai_usage%rowtype;
 input_tokens bigint;
 cached_tokens bigint;
 output_tokens bigint;
 used numeric;
 cost_usd numeric;
begin
 select * into entry from public.line_oa_kit_ai_usage where request_id=p_request;
 if not found then return null; end if;
 if entry.purpose<>'build' then perform 1 from public.line_oa_kit_build_budget where id=1 for update; end if;
 perform 1 from public.line_oa_kit_points_wallets where line_subject=entry.line_subject for update;
 select * into entry from public.line_oa_kit_ai_usage where request_id=p_request for update;
 if entry.used_points is not null then return entry.used_points; end if;
 if p_usage is null then
  used=0;
  cost_usd=entry.reserved_usd;
 else
  if p_usage->>'model' is distinct from 'gpt-4.1-mini-2025-04-14' then raise exception 'unsupported usage model'; end if;
  input_tokens=(p_usage->>'inputTokens')::bigint;
  cached_tokens=coalesce((p_usage->>'cachedTokens')::bigint,0);
  output_tokens=(p_usage->>'outputTokens')::bigint;
  if input_tokens is null or output_tokens is null or input_tokens<cached_tokens or cached_tokens<0 or output_tokens<0 then
   raise exception 'invalid token usage';
  end if;
  cost_usd=((input_tokens-cached_tokens)*0.40+cached_tokens*0.10+output_tokens*1.60)/1000000;
  used=round(cost_usd*entry.usd_to_twd*10,6);
  if used>entry.reserved_points then raise exception 'usage exceeds reservation'; end if;
 end if;
 update public.line_oa_kit_points_wallets set balance=balance+entry.reserved_points-used where line_subject=entry.line_subject;
 update public.line_oa_kit_ai_usage set used_points=used,usage=p_usage where request_id=p_request;
 if entry.purpose<>'build' then
  update public.line_oa_kit_build_budget set reserved_usd=reserved_usd-entry.reserved_usd,spent_usd=spent_usd+cost_usd where id=1;
 end if;
 return used;
end;
$$;

revoke all on function public.line_oa_kit_credit_points(),public.line_oa_kit_reserve_ai(text,uuid,text,text,numeric),public.line_oa_kit_settle_ai(text,jsonb) from public,anon,authenticated;
grant execute on function public.line_oa_kit_credit_points(),public.line_oa_kit_reserve_ai(text,uuid,text,text,numeric),public.line_oa_kit_settle_ai(text,jsonb) to service_role;

create function public.line_oa_kit_begin_points_payment(p_project uuid,p_subject text,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_payments%rowtype;
begin
 if p_environment is null or p_environment not in ('sandbox','production') then return jsonb_build_object('error','invalid_environment'); end if;
 if not exists(select 1 from public.line_oa_kit_ai_rates) then return jsonb_build_object('error','points_rate_missing'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_subject,743014));
 perform 1 from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','not_owned'); end if;
 if exists(select 1 from public.line_oa_kit_build_access where project_id=p_project) then return jsonb_build_object('error','already_unlocked'); end if;
 select * into d from public.line_oa_kit_payments where project_id=p_project and line_subject=p_subject and environment=p_environment and status<>'cancelled';
 if found then return jsonb_build_object('order',to_jsonb(d),'created',false); end if;
 if (select count(*) from public.line_oa_kit_payments where line_subject=p_subject and created_at>now()-interval '1 day')>=5 then
  return jsonb_build_object('error','rate_limit');
 end if;
 insert into public.line_oa_kit_payments(project_id,line_subject,environment,amount) values(p_project,p_subject,p_environment,1680) returning * into d;
 return jsonb_build_object('order',to_jsonb(d),'created',true);
end;
$$;
revoke all on function public.line_oa_kit_begin_points_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.line_oa_kit_begin_points_payment(uuid,text,text) to service_role;

create function public.line_oa_kit_reserve_build_points()
returns trigger language plpgsql security invoker set search_path='' as $$
declare held jsonb;
begin
 if exists(select 1 from public.line_oa_kit_payments where project_id=new.project_id and line_subject=new.line_subject and amount=1680 and status='paid' and environment='production') then
  held=public.line_oa_kit_reserve_ai('build:'||new.id::text,new.project_id,new.line_subject,'build',new.reserved_usd);
  if held?'error' then raise exception '%',held->>'error'; end if;
 end if;
 return new;
end;
$$;

create function public.line_oa_kit_settle_build_points()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.line_oa_kit_settle_ai('build:'||new.id::text,new.usage);
 return new;
end;
$$;

create trigger line_oa_kit_reserve_build_points before insert on public.line_oa_kit_build_jobs
 for each row when(new.status='queued') execute function public.line_oa_kit_reserve_build_points();
create trigger line_oa_kit_settle_build_points after update of status on public.line_oa_kit_build_jobs
 for each row when(old.status in ('queued','running') and new.status in ('draft_ready','failed','interrupted'))
 execute function public.line_oa_kit_settle_build_points();
revoke all on function public.line_oa_kit_reserve_build_points(),public.line_oa_kit_settle_build_points() from public,anon,authenticated;
grant execute on function public.line_oa_kit_reserve_build_points(),public.line_oa_kit_settle_build_points() to service_role;

create function public.line_oa_kit_points_status(p_project uuid,p_subject text)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('mode','points','remaining',w.balance,'estimateMax',round(r.usd_to_twd*0.5,6))
 from public.line_oa_kit_points_wallets w
 left join lateral (select usd_to_twd from public.line_oa_kit_ai_rates order by version desc limit 1) r on true
 where w.line_subject=p_subject and exists(
  select 1 from public.line_oa_kit_payments
  where project_id=p_project and line_subject=p_subject and amount=1680 and status='paid' and environment='production'
 );
$$;
revoke all on function public.line_oa_kit_points_status(uuid,text) from public,anon,authenticated;
grant execute on function public.line_oa_kit_points_status(uuid,text) to service_role;

create table public.line_oa_kit_runtime_keys (
 project_id uuid primary key references public.line_oa_kit_designs(id) on delete cascade,
 line_subject text not null,
 key_digest text not null unique check(key_digest ~ '^[a-f0-9]{64}$'),
 revoked_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.line_oa_kit_runtime_keys enable row level security;
revoke all on public.line_oa_kit_runtime_keys from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_runtime_keys to service_role;

create or replace function public.line_oa_kit_begin_build(p_project uuid,p_subject text,p_design_revision integer,p_setup_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_designs%rowtype; a public.line_oa_kit_build_access%rowtype; j public.line_oa_kit_build_jobs%rowtype; budget public.line_oa_kit_build_budget%rowtype;
begin
 select * into d from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','project_not_found'); end if;
 select * into a from public.line_oa_kit_build_access where project_id=d.id and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','access_required'); end if;
 if d.revision is distinct from p_design_revision or a.setup_revision is distinct from p_setup_revision then return jsonb_build_object('error','revision_conflict'); end if;
 if a.grant_method='line_pay' and d.confirmed_revision is distinct from d.revision then return jsonb_build_object('error','design_review_required'); end if;
 -- Idempotent reads of an existing version never consume another credit.
 select * into j from public.line_oa_kit_build_jobs where project_id=d.id and design_revision=d.revision and setup_revision=a.setup_revision;
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'created',false); end if;
 select * into j from public.line_oa_kit_build_jobs where project_id=d.id and status in ('queued','running');
 if found then return jsonb_build_object('job_id',j.id,'status',j.status,'created',false); end if;
 if not exists(select 1 from public.line_oa_kit_payments where project_id=d.id and line_subject=p_subject and amount=1680 and status='paid' and environment='production') and (select count(*) from public.line_oa_kit_build_jobs where project_id=d.id and line_subject=p_subject and status in ('draft_ready','queued','running'))>=a.build_limit then return jsonb_build_object('error','build_credits_exhausted'); end if;
 select * into budget from public.line_oa_kit_build_budget where id=1 for update;
 if not found or budget.limit_usd-budget.spent_usd-budget.reserved_usd<0.05 then return jsonb_build_object('error','pilot_budget_exhausted'); end if;
 update public.line_oa_kit_build_budget set reserved_usd=reserved_usd+0.05 where id=1;
 insert into public.line_oa_kit_build_jobs(project_id,line_subject,design_revision,setup_revision,status,snapshot)
 values(d.id,p_subject,d.revision,a.setup_revision,'queued',jsonb_build_object('design',d.config,'setup',a.setup)) returning * into j;
 return jsonb_build_object('job_id',j.id,'status',j.status,'created',true);
end;$$;
