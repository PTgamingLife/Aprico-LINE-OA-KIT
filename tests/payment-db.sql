-- Transactional fixtures, rolled back. No provider API is invoked.
begin;
do $$
declare s text:='U00000000000000000000000000000000'; other_s text:='U00000000000000000000000000000001';
 p uuid:='00000000-0000-4000-8000-000000000081'; x jsonb; d uuid; first_id uuid;
begin
 insert into public.line_oa_kit_designs(id,line_subject,config,revision) values(p,s,'{}',1);
 x:=public.line_oa_kit_begin_payment(p,other_s,'sandbox');
 if x->>'error' is distinct from 'not_owned' then raise exception 'cross owner'; end if;
 x:=public.line_oa_kit_begin_payment(p,s,null);
 if x->>'error' is distinct from 'invalid_environment' then raise exception 'null environment'; end if;
 x:=public.line_oa_kit_begin_payment(p,s,'sandbox');d:=(x->'order'->>'id')::uuid;first_id:=d;
 if (x->'order'->>'amount')::integer is distinct from 3860 then raise exception 'wrong promotion price'; end if;
 x:=public.line_oa_kit_begin_payment(p,s,'sandbox');
 if (x->>'created')::boolean is distinct from false or (x->'order'->>'id')::uuid is distinct from d then raise exception 'duplicate order'; end if;
 update public.line_oa_kit_payments set status='confirming',transaction_id='2026103012345678910' where id=d;
 x:=public.line_oa_kit_settle_payment(d,other_s,'2026103012345678910','sandbox');
 if x->>'error' is distinct from 'mismatch' then raise exception 'cross owner settle'; end if;
 x:=public.line_oa_kit_settle_payment(d,s,null,'sandbox');
 if x->>'error' is distinct from 'mismatch' then raise exception 'null tx settle'; end if;
 x:=public.line_oa_kit_settle_payment(d,s,'2026103012345678910','production');
 if x->>'error' is distinct from 'mismatch' then raise exception 'sandbox escalation'; end if;
 x:=public.line_oa_kit_settle_payment(d,s,'2026103012345678910','sandbox');
 if (x->>'unlocked')::boolean is distinct from false or exists(select 1 from public.line_oa_kit_build_access where project_id=p) then raise exception 'sandbox granted'; end if;
 x:=public.line_oa_kit_begin_payment(p,s,'production');d:=(x->'order'->>'id')::uuid;
 update public.line_oa_kit_payments set status='confirming',transaction_id='2026103012345678911' where id=d;
 x:=public.line_oa_kit_settle_payment(d,s,'2026103012345678911','production');
 if (x->>'unlocked')::boolean is distinct from true then raise exception 'prod no grant'; end if;
 update public.line_oa_kit_build_access set setup='{"purpose":"must preserve"}',setup_revision=1 where project_id=p;
 x:=public.line_oa_kit_settle_payment(d,s,'2026103012345678911','production');
 if (select setup_revision from public.line_oa_kit_build_access where project_id=p) is distinct from 1 then raise exception 'retry overwrote setup'; end if;
 x:=public.line_oa_kit_begin_payment(p,s,'production');
 if x->>'error' is distinct from 'already_unlocked' then raise exception 'already paid'; end if;
end;$$;
select has_table_privilege('anon','public.line_oa_kit_payments','select') as anon_read,
 has_table_privilege('authenticated','public.line_oa_kit_payments','update') as client_write,
 has_function_privilege('anon','public.line_oa_kit_settle_payment(uuid,text,text,text)','execute') as anon_settle,
 has_function_privilege('authenticated','public.line_oa_kit_begin_payment(uuid,text,text)','execute') as client_create;
rollback;
