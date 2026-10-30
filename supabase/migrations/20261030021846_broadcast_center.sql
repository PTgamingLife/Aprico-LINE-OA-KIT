create table public.line_oa_kit_broadcasts(
 id uuid primary key,
 line_subject text not null check(line_subject ~ '^U[0-9a-f]{32}$'),
 config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=16000),
 status text not null default 'draft' check(status in ('draft','prepared','sending','accepted','failed','unknown')),
 revision integer not null default 1 check(revision>0),
 confirm_hash text,
 prepared_until timestamptz,
 send_started_at timestamptz,
 request_id text,
 error_code text,
 test_revision integer not null default 0,
 test_key uuid,
 test_status text check(test_status in ('sending','accepted','failed','unknown')),
 test_request_id text,
 test_started_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index line_oa_kit_broadcasts_owner_created_idx on public.line_oa_kit_broadcasts(line_subject,created_at desc);
alter table public.line_oa_kit_broadcasts enable row level security;
revoke all on public.line_oa_kit_broadcasts from public,anon,authenticated;
grant select,insert,update on public.line_oa_kit_broadcasts to service_role;

-- Security invoker: only service_role can execute. Locks are held only for the
-- atomic claim, never during a LINE network request. No automatic retry path.
create function public.line_oa_kit_claim_broadcast(p_subject text,p_id uuid,p_revision integer,p_mode text,p_confirm_hash text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.line_oa_kit_broadcasts; t timestamptz:=now();
begin
 if p_mode is null or p_mode not in ('test','broadcast') then return jsonb_build_object('error','invalid_mode'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_subject,743013));
 select * into d from public.line_oa_kit_broadcasts where id=p_id and line_subject=p_subject for update;
 if not found or d.revision is distinct from p_revision or d.status not in ('draft','prepared') then return jsonb_build_object('error','not_ready'); end if;
 if p_mode='test' then
  if d.test_revision>=d.revision or exists(select 1 from public.line_oa_kit_broadcasts where line_subject=p_subject and test_started_at>t-interval '10 seconds') then return jsonb_build_object('error','test_already_claimed'); end if;
  update public.line_oa_kit_broadcasts set test_revision=revision,test_key=gen_random_uuid(),test_status='sending',test_request_id=null,test_started_at=t,updated_at=t where id=p_id returning * into d;
  return jsonb_build_object('draft',to_jsonb(d),'retryKey',d.test_key);
 end if;
 if d.status<>'prepared' or d.prepared_until is null or d.prepared_until<=t or d.confirm_hash is null or p_confirm_hash is null or d.confirm_hash<>p_confirm_hash then return jsonb_build_object('error','confirmation_expired'); end if;
 if exists(select 1 from public.line_oa_kit_broadcasts where line_subject=p_subject and send_started_at>t-interval '60 seconds') then return jsonb_build_object('error','send_too_soon'); end if;
 if (select count(*) from public.line_oa_kit_broadcasts where line_subject=p_subject and send_started_at >= (date_trunc('day',t at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'))>=5 then return jsonb_build_object('error','daily_limit'); end if;
 update public.line_oa_kit_broadcasts set status='sending',confirm_hash=null,prepared_until=null,send_started_at=t,updated_at=t,revision=revision+1 where id=p_id returning * into d;
 return jsonb_build_object('draft',to_jsonb(d),'retryKey',d.id);
end; $$;
revoke all on function public.line_oa_kit_claim_broadcast(text,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.line_oa_kit_claim_broadcast(text,uuid,integer,text,text) to service_role;
