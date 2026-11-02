-- Server-only OAuth handshake and repository bindings. No GitHub tokens are stored.
create table public.line_oa_kit_github_flows (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.line_oa_kit_designs(id) on delete cascade,
 line_subject text not null,
 state_hash text not null unique,
 browser_hash text not null,
 verifier text not null,
 status text not null default 'pending' check(status in ('pending','processing','ready','failed','used')),
 github_user_id bigint, login text,
 choices jsonb not null default '[]', truncated boolean not null default false,
 error_code text,
 expires_at timestamptz not null default now()+interval '10 minutes',
 created_at timestamptz not null default now()
);
create index line_oa_kit_github_flows_owner on public.line_oa_kit_github_flows(project_id,line_subject,created_at desc);
create table public.line_oa_kit_github_connections (
 project_id uuid primary key references public.line_oa_kit_designs(id) on delete cascade,
 line_subject text not null,
 installation_id bigint not null, repository_id bigint not null,
 github_user_id bigint not null, login text not null, full_name text not null,
 verified_at timestamptz not null default now(), revoked_at timestamptz
);
create index line_oa_kit_github_connections_installation on public.line_oa_kit_github_connections(installation_id);
create index line_oa_kit_github_connections_user on public.line_oa_kit_github_connections(github_user_id);
alter table public.line_oa_kit_github_flows enable row level security;
alter table public.line_oa_kit_github_connections enable row level security;
revoke all on public.line_oa_kit_github_flows,public.line_oa_kit_github_connections from public,anon,authenticated;
grant select,insert,update,delete on public.line_oa_kit_github_flows,public.line_oa_kit_github_connections to service_role;

create function public.line_oa_kit_github_begin(p_project uuid,p_subject text,p_hash text,p_verifier text,p_browser_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 perform 1 from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then raise exception 'project_not_owned'; end if;
 if (select count(*) from public.line_oa_kit_github_flows where project_id=p_project and line_subject=p_subject and created_at>now()-interval '15 minutes')>=6 then raise exception 'connection_rate_limited'; end if;
 delete from public.line_oa_kit_github_flows where project_id=p_project and expires_at<now();
 insert into public.line_oa_kit_github_flows(project_id,line_subject,state_hash,verifier,browser_hash) values(p_project,p_subject,p_hash,p_verifier,p_browser_hash) returning id into result;
 return result;
end; $$;

-- Atomic, single-use choice consumption. Installation IDs are taken from GitHub,
-- never accepted as authority from a browser request.
create function public.line_oa_kit_github_bind(p_project uuid,p_subject text,p_flow uuid,p_repository bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare f public.line_oa_kit_github_flows; choice jsonb;
begin
 perform 1 from public.line_oa_kit_designs where id=p_project and line_subject=p_subject for update;
 if not found then return false; end if;
 select * into f from public.line_oa_kit_github_flows where id=p_flow and project_id=p_project and line_subject=p_subject and status='ready' and expires_at>now() for update;
 if not found then return false; end if;
 select v into choice from jsonb_array_elements(f.choices) v where (v->>'repositoryId')::bigint=p_repository limit 1;
 if choice is null then return false; end if;
 insert into public.line_oa_kit_github_connections(project_id,line_subject,installation_id,repository_id,github_user_id,login,full_name)
 values(p_project,p_subject,(choice->>'installationId')::bigint,p_repository,f.github_user_id,f.login,choice->>'fullName')
 on conflict(project_id) do update set line_subject=excluded.line_subject,installation_id=excluded.installation_id,repository_id=excluded.repository_id,github_user_id=excluded.github_user_id,login=excluded.login,full_name=excluded.full_name,verified_at=now(),revoked_at=null;
 update public.line_oa_kit_github_flows set status='used',choices='[]',verifier='' where id=f.id;
 return true;
end; $$;
revoke all on function public.line_oa_kit_github_begin(uuid,text,text,text,text),public.line_oa_kit_github_bind(uuid,text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.line_oa_kit_github_begin(uuid,text,text,text,text),public.line_oa_kit_github_bind(uuid,text,uuid,bigint) to service_role;
