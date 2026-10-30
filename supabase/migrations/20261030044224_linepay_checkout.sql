-- Private ledger: LINE identity is verified by Edge before any operation.
create table public.line_oa_kit_payments(
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.line_oa_kit_designs(id),
 line_subject text not null check(line_subject ~ '^U[0-9a-f]{32}$'),
 environment text not null check(environment in ('sandbox','production')),
 amount integer not null default 1890 check(amount=1890),
 currency text not null default 'TWD' check(currency='TWD'),
 status text not null default 'requesting' check(status in ('requesting','pending','confirming','unknown','paid','test_paid','cancelled')),
 transaction_id text check(transaction_id ~ '^\d{16,20}$'),
 payment_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 paid_at timestamptz,
 unique(environment,transaction_id)
);
create index line_oa_kit_payments_owner_idx on public.line_oa_kit_payments(line_subject,created_at desc);
create unique index line_oa_kit_payments_active_idx on public.line_oa_kit_payments(project_id,environment) where status<>'cancelled';
alter table public.line_oa_kit_payments enable row level security;
revoke all on public.line_oa_kit_payments from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_payments to service_role;

create function public.line_oa_kit_begin_payment(p_project uuid,p_subject text,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_payments;
begin
 if p_environment is null or p_environment not in ('sandbox','production') then return jsonb_build_object('error','invalid_environment'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_subject,743014));
 perform 1 from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then return jsonb_build_object('error','not_owned'); end if;
 if exists(select 1 from public.line_oa_kit_build_access where project_id=p_project) then return jsonb_build_object('error','already_unlocked'); end if;
 select * into d from public.line_oa_kit_payments where project_id=p_project and line_subject=p_subject and environment=p_environment and status<>'cancelled';
 if found then return jsonb_build_object('order',to_jsonb(d),'created',false); end if;
 if (select count(*) from public.line_oa_kit_payments where line_subject=p_subject and created_at>now()-interval '1 day')>=5 then return jsonb_build_object('error','rate_limit'); end if;
 insert into public.line_oa_kit_payments(project_id,line_subject,environment) values(p_project,p_subject,p_environment) returning * into d;
 return jsonb_build_object('order',to_jsonb(d),'created',true);
end;$$;
create function public.line_oa_kit_settle_payment(p_order uuid,p_subject text,p_transaction text,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_payments;
begin
 select * into d from public.line_oa_kit_payments where id=p_order and line_subject=p_subject for update;
 if not found or d.transaction_id is null or d.transaction_id is distinct from p_transaction or d.environment is distinct from p_environment or d.status='cancelled' then return jsonb_build_object('error','mismatch'); end if;
 perform 1 from public.line_oa_kit_designs where id=d.project_id and line_subject=p_subject;
 if not found then return jsonb_build_object('error','not_owned'); end if;
 update public.line_oa_kit_payments set status=case when d.environment='production' then 'paid' else 'test_paid' end,paid_at=coalesce(paid_at,now()),updated_at=now() where id=d.id;
 -- Test payments must never grant production access. Atomic grant + receipt.
 if d.environment='production' then
  insert into public.line_oa_kit_build_access(project_id,line_subject,grant_method) values(d.project_id,p_subject,'line_pay') on conflict(project_id) do nothing;
 end if;
 return jsonb_build_object('ok',true,'unlocked',d.environment='production');
end;$$;
revoke all on function public.line_oa_kit_begin_payment(uuid,text,text),public.line_oa_kit_settle_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.line_oa_kit_begin_payment(uuid,text,text),public.line_oa_kit_settle_payment(uuid,text,text,text) to service_role;
