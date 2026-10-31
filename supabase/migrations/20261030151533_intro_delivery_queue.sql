-- Dedicated Aprico campaign; default OFF until read-only preflight and tests pass.
create table public.line_oa_kit_intro_control (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 welcome_enabled boolean not null default false,
 enabled_at timestamptz,
 cards jsonb not null check(jsonb_typeof(cards)='array' and jsonb_array_length(cards)=2),
 last_check jsonb,
 last_check_at timestamptz
);
create table public.line_oa_kit_intro_members (
 subject text primary key check(subject ~ '^U[0-9a-f]{32}$'),
 first_event_id text unique,
 followed_at timestamptz not null,
 active boolean not null default true,
 updated_at timestamptz not null default now()
);
create table public.line_oa_kit_intro_jobs (
 id uuid primary key default gen_random_uuid(),
 dedupe_key text not null unique,
 kind text not null check(kind in ('broadcast','push')),
 subject text references public.line_oa_kit_intro_members(subject),
 card integer not null check(card in (1,2)),
 config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=16000),
 scheduled_at timestamptz not null,
 expires_at timestamptz not null,
 next_attempt_at timestamptz not null default now(),
 depends_on uuid references public.line_oa_kit_intro_jobs(id),
 status text not null default 'pending' check(status in ('pending','preflight','sending','accepted','failed','unknown','cancelled','expired','blocked')),
 claim_key uuid,
 claimed_at timestamptz,
 attempts integer not null default 0,
 send_started_at timestamptz,
 accepted_at timestamptz,
 request_id text,
 error_code text,
 checks jsonb,
 created_at timestamptz not null default now(),
 check((kind='broadcast' and subject is null) or (kind='push' and subject is not null)),
 check(expires_at>scheduled_at)
);
create index line_oa_kit_intro_due_idx on public.line_oa_kit_intro_jobs(scheduled_at,next_attempt_at) where status='pending';
create index line_oa_kit_intro_subject_idx on public.line_oa_kit_intro_jobs(subject) where kind='push';
create index line_oa_kit_intro_dependency_idx on public.line_oa_kit_intro_jobs(depends_on) where depends_on is not null;
create table public.line_oa_kit_intro_ticks (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 mode text not null check(mode in ('check','run')),
 expires_at timestamptz not null,
 claimed_at timestamptz,
 result jsonb,
 created_at timestamptz not null default now()
);
alter table public.line_oa_kit_intro_control enable row level security;
alter table public.line_oa_kit_intro_members enable row level security;
alter table public.line_oa_kit_intro_jobs enable row level security;
alter table public.line_oa_kit_intro_ticks enable row level security;
revoke all on public.line_oa_kit_intro_control,public.line_oa_kit_intro_members,public.line_oa_kit_intro_jobs,public.line_oa_kit_intro_ticks from public,anon,authenticated;
grant select,insert,update,delete on public.line_oa_kit_intro_control,public.line_oa_kit_intro_members,public.line_oa_kit_intro_jobs,public.line_oa_kit_intro_ticks to service_role;

create function public.line_oa_kit_intro_follow(p_subject text,p_event text,p_type text,p_at timestamptz,p_unblocked boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.line_oa_kit_intro_control; first_id uuid; was_known boolean;
begin
 if p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' or p_event is null or length(p_event) not between 1 and 100 or p_type not in ('follow','unfollow') or p_at is null or p_at>now()+interval '5 minutes' or p_at<now()-interval '24 hours' then return '{}'::jsonb; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_subject,103001));
 if p_type='unfollow' then
  update public.line_oa_kit_intro_members set active=false,updated_at=now() where subject=p_subject and updated_at<=p_at;
  update public.line_oa_kit_intro_jobs set status='cancelled',error_code='unfollowed' where subject=p_subject and status in ('pending','preflight') and not exists(select 1 from public.line_oa_kit_intro_members m where m.subject=p_subject and m.active);
  return '{}'::jsonb;
 end if;
 select * into c from public.line_oa_kit_intro_control where id;
 if not found or not c.enabled or not c.welcome_enabled or c.enabled_at is null or p_at<c.enabled_at then return '{}'::jsonb; end if;
 select exists(select 1 from public.line_oa_kit_intro_members where subject=p_subject) into was_known;
 if was_known then
  update public.line_oa_kit_intro_members set active=true,updated_at=p_at where subject=p_subject and updated_at<=p_at;
  return '{}'::jsonb; -- Replays/unblocks never restart a completed welcome sequence.
 end if;
 -- Unblocking an old friend is not a new subscription.
 if p_unblocked then return '{}'::jsonb; end if;
 insert into public.line_oa_kit_intro_members(subject,first_event_id,followed_at,updated_at) values(p_subject,p_event,p_at,p_at) on conflict do nothing;
 if not found then return '{}'::jsonb; end if;
 insert into public.line_oa_kit_intro_jobs(dedupe_key,kind,subject,card,config,scheduled_at,expires_at)
 values('welcome:'||p_subject||':1','push',p_subject,1,c.cards->0,now(),now()+interval '48 hours') returning id into first_id;
 insert into public.line_oa_kit_intro_jobs(dedupe_key,kind,subject,card,config,scheduled_at,expires_at,depends_on)
 values('welcome:'||p_subject||':2','push',p_subject,2,c.cards->1,now()+interval '24 hours',now()+interval '96 hours',first_id);
 return jsonb_build_object('firstJob',first_id);
end; $$;

create function public.line_oa_kit_intro_claim(p_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.line_oa_kit_intro_jobs;
begin
 if not exists(select 1 from public.line_oa_kit_intro_control where id and enabled) then return '{}'::jsonb; end if;
 -- A crashed sender is uncertain, never automatically sent again.
 update public.line_oa_kit_intro_jobs set status='unknown',error_code='sender_interrupted' where status='sending' and send_started_at<now()-interval '3 minutes';
 update public.line_oa_kit_intro_jobs set status='pending',claim_key=null,error_code='preflight_interrupted' where status='preflight' and claimed_at<now()-interval '3 minutes';
 update public.line_oa_kit_intro_jobs set status='expired',error_code='send_window_expired' where status='pending' and expires_at<=now();
 select * into j from public.line_oa_kit_intro_jobs q where q.status='pending' and q.scheduled_at<=now() and q.next_attempt_at<=now() and q.expires_at>now() and (p_id is null or q.id=p_id)
 and (q.kind='broadcast' or exists(select 1 from public.line_oa_kit_intro_members m where m.subject=q.subject and m.active))
 and (q.depends_on is null or exists(select 1 from public.line_oa_kit_intro_jobs d where d.id=q.depends_on and d.status='accepted'))
 order by q.scheduled_at,q.id for update skip locked limit 1;
 if not found then return '{}'::jsonb; end if;
 update public.line_oa_kit_intro_jobs set status='preflight',claim_key=gen_random_uuid(),claimed_at=now(),attempts=attempts+1 where id=j.id returning * into j;
 return to_jsonb(j);
end; $$;

create function public.line_oa_kit_intro_begin(p_id uuid,p_key uuid,p_checks jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.line_oa_kit_intro_jobs; needed integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(103001,228);
 select * into j from public.line_oa_kit_intro_jobs where id=p_id for update;
 if not found or j.status<>'preflight' or j.claim_key is distinct from p_key or j.expires_at<=now() or p_checks->>'basicId' is distinct from '@228srwlt' or not exists(select 1 from public.line_oa_kit_intro_control where id and enabled) then return false; end if;
 if j.kind='push' and not exists(select 1 from public.line_oa_kit_intro_members where subject=j.subject and active) then update public.line_oa_kit_intro_jobs set status='cancelled',error_code='unfollowed' where id=p_id; return false; end if;
 needed:=greatest(1,(p_checks->>'estimatedMessages')::integer);
 if not coalesce((p_checks->>'unlimited')::boolean,false) and ((p_checks->>'remaining') is null or (p_checks->>'remaining')::integer < needed+coalesce((select sum(greatest(1,(checks->>'estimatedMessages')::integer)) from public.line_oa_kit_intro_jobs where status='sending'),0)) then
  update public.line_oa_kit_intro_jobs set status='pending',claim_key=null,next_attempt_at=now()+interval '15 minutes',error_code='quota_reserved' where id=p_id; return false;
 end if;
 if j.kind='broadcast' and (exists(select 1 from public.line_oa_kit_intro_jobs where kind='broadcast' and send_started_at>now()-interval '1 minute') or exists(select 1 from public.line_oa_kit_broadcasts where send_started_at>now()-interval '1 minute')) then
  update public.line_oa_kit_intro_jobs set status='pending',claim_key=null,next_attempt_at=now()+interval '1 minute',error_code='send_too_soon' where id=p_id; return false;
 end if;
 update public.line_oa_kit_intro_jobs set status='sending',send_started_at=now(),checks=p_checks where id=p_id;
 return true;
end; $$;

create function public.line_oa_kit_intro_finish(p_id uuid,p_key uuid,p_status text,p_error text default null,p_request text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.line_oa_kit_intro_jobs;
begin
 select * into j from public.line_oa_kit_intro_jobs where id=p_id for update;
 if not found or j.claim_key is distinct from p_key then return false; end if;
 if p_error is not null and p_error !~ '^[a-z0-9_]{1,60}$' then return false; end if;
 if j.status='preflight' and p_status in ('defer','blocked') then
  update public.line_oa_kit_intro_jobs set status=case when p_status='blocked' or attempts>=6 then 'blocked' else 'pending' end,next_attempt_at=now()+interval '15 minutes',claim_key=null,error_code=p_error where id=p_id; return true;
 end if;
 if j.status<>'sending' or p_status not in ('accepted','failed','unknown') then return false; end if;
 update public.line_oa_kit_intro_jobs set status=p_status,error_code=p_error,request_id=left(p_request,100),accepted_at=case when p_status='accepted' then now() else null end where id=p_id;
 if p_status='accepted' and j.kind='push' and j.card=1 then
  update public.line_oa_kit_intro_jobs set scheduled_at=now()+interval '24 hours',expires_at=now()+interval '72 hours' where depends_on=p_id and status='pending';
 end if;
 return true;
end; $$;

revoke all on function public.line_oa_kit_intro_follow(text,text,text,timestamptz,boolean),public.line_oa_kit_intro_claim(uuid),public.line_oa_kit_intro_begin(uuid,uuid,jsonb),public.line_oa_kit_intro_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.line_oa_kit_intro_follow(text,text,text,timestamptz,boolean),public.line_oa_kit_intro_claim(uuid),public.line_oa_kit_intro_begin(uuid,uuid,jsonb),public.line_oa_kit_intro_finish(uuid,uuid,text,text,text) to service_role;

-- Cron holds no permanent secret: a random single-use nonce authorizes only one
-- fixed tick, expires in 90 seconds, and is never returned from this helper.
create schema if not exists line_oa_kit_internal;
revoke all on schema line_oa_kit_internal from public,anon,authenticated;
create function line_oa_kit_internal.invoke_intro(p_mode text default 'run')
returns bigint language plpgsql security invoker set search_path='' as $$
declare k text; request bigint;
begin
 if p_mode not in ('run','check') then raise exception 'invalid_mode'; end if;
 if p_mode='run' and not exists(select 1 from public.line_oa_kit_intro_control where id and enabled) then return null; end if;
 delete from public.line_oa_kit_intro_ticks where created_at<now()-interval '7 days';
 k:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.line_oa_kit_intro_ticks(token_hash,mode,expires_at) values(encode(extensions.digest(k,'sha256'),'hex'),p_mode,now()+interval '90 seconds');
 select net.http_post(url:='https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-intro',headers:=jsonb_build_object('Content-Type','application/json','x-intro-tick',k),body:='{}'::jsonb,timeout_milliseconds:=120000) into request;
 return request;
end; $$;
revoke all on function line_oa_kit_internal.invoke_intro(text) from public,anon,authenticated,service_role;
