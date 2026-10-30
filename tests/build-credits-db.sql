-- All test changes roll back, no external API calls.
begin;
do $$
declare s text:='U00000000000000000000000000000000'; p uuid:='00000000-0000-4000-8000-000000000091'; x jsonb; j uuid; i integer;
begin
 insert into public.line_oa_kit_designs(id,line_subject,config,revision) values(p,s,'{}',1);
 insert into public.line_oa_kit_build_access(project_id,line_subject,grant_method,setup_revision) values(p,s,'manual_password',1);
 -- A fixture-only budget increase inside this rollback transaction.
 update public.line_oa_kit_build_budget set limit_usd=100,reserved_usd=0,spent_usd=0 where id=1;
 x:=public.line_oa_kit_build_credits(p,s);
 if (x->>'remaining')::integer is distinct from 5 then raise exception 'initial credits'; end if;
 x:=public.line_oa_kit_build_credits(p,'U11111111111111111111111111111111');
 if x->>'error' is distinct from 'access_required' then raise exception 'cross owner credits'; end if;
 x:=public.line_oa_kit_begin_build(p,s,1,1);j:=(x->>'job_id')::uuid;
 x:=public.line_oa_kit_build_credits(p,s);
 if (x->>'pending')::integer is distinct from 1 or (x->>'remaining')::integer is distinct from 4 then raise exception 'reservation'; end if;
 x:=public.line_oa_kit_begin_build(p,s,1,1);
 if (x->>'created')::boolean is distinct from false or (x->>'job_id')::uuid is distinct from j then raise exception 'idempotency'; end if;
 perform public.line_oa_kit_finish_build(j,null,null,'fixture_failure');
 x:=public.line_oa_kit_build_credits(p,s);
 if (x->>'remaining')::integer is distinct from 5 then raise exception 'failure charged'; end if;
 for i in 2..6 loop
  update public.line_oa_kit_designs set revision=i where id=p;
  x:=public.line_oa_kit_begin_build(p,s,i,1);j:=(x->>'job_id')::uuid;
  if j is null then raise exception 'valid generation denied'; end if;
  perform public.line_oa_kit_finish_build(j,'{"files":[]}'::jsonb,'{"inputTokens":1,"outputTokens":1}'::jsonb,null);
 end loop;
 x:=public.line_oa_kit_build_credits(p,s);
 if (x->>'used')::integer is distinct from 5 or (x->>'remaining')::integer is distinct from 0 then raise exception 'five successes'; end if;
 -- Reading the fifth version remains possible even when exhausted.
 x:=public.line_oa_kit_begin_build(p,s,6,1);
 if (x->>'created')::boolean is distinct from false then raise exception 'existing version charged'; end if;
 update public.line_oa_kit_designs set revision=7 where id=p;
 x:=public.line_oa_kit_begin_build(p,s,7,1);
 if x->>'error' is distinct from 'build_credits_exhausted' then raise exception 'sixth allowed'; end if;
 x:=public.line_oa_kit_begin_build(p,s,null,1);
 if x->>'error' is distinct from 'revision_conflict' then raise exception 'null revision'; end if;
end;$$;
select has_function_privilege('anon','public.line_oa_kit_build_credits(uuid,text)','execute') as anon_credits,
has_function_privilege('authenticated','public.line_oa_kit_begin_build(uuid,text,integer,integer)','execute') as user_begin;
rollback;
