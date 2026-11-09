begin;
do $$
declare
 s text:='U00000000000000000000000000000002';
 other_s text:='U00000000000000000000000000000003';
 p uuid:='00000000-0000-4000-8000-000000000092';
 session_id uuid:=gen_random_uuid();
 order_id uuid;
 job_id uuid;
 x jsonb;
begin
 insert into public.line_oa_kit_designs(id,line_subject,config,revision) values(p,s,'{}',1);
 insert into public.line_oa_kit_ai_rates(version,usd_to_twd) values(1,32);
 update public.line_oa_kit_build_budget set limit_usd=100,reserved_usd=0,spent_usd=0 where id=1;
 x:=public.line_oa_kit_begin_points_payment(p,s,'sandbox');
 order_id:=(x->'order'->>'id')::uuid;
 if (x->'order'->>'amount')::integer is distinct from 1680 then raise exception 'wrong points price'; end if;
 update public.line_oa_kit_payments set status='confirming',transaction_id='2026110912345678910' where id=order_id;
 perform public.line_oa_kit_settle_payment(order_id,s,'2026110912345678910','sandbox');
 if exists(select 1 from public.line_oa_kit_points_wallets where line_subject=s) then raise exception 'sandbox credited wallet'; end if;
 x:=public.line_oa_kit_begin_points_payment(p,s,'production');
 order_id:=(x->'order'->>'id')::uuid;
 update public.line_oa_kit_payments set status='confirming',transaction_id='2026110912345678911' where id=order_id;
 perform public.line_oa_kit_settle_payment(order_id,s,'2026110912345678911','production');
 perform public.line_oa_kit_settle_payment(order_id,s,'2026110912345678911','production');
 if (select balance from public.line_oa_kit_points_wallets where line_subject=s) is distinct from 1680 then raise exception 'duplicate or missing credit'; end if;
 if public.line_oa_kit_points_status(p,other_s) is not null then raise exception 'wallet access crossed owners'; end if;

 x:=public.line_oa_kit_begin_build(p,s,1,0);
 if x->>'error' is distinct from 'design_review_required' then raise exception 'unconfirmed build accepted'; end if;
 insert into public.line_oa_kit_chat_review_sessions(line_subject,revision,state,last_event)
 values(s,session_id,jsonb_build_object('id',p,'step','paidReview','projectRevision',1),'fixture');
 if public.line_oa_kit_confirm_chat_design(other_s,session_id,gen_random_uuid(),'fixture','{"edited":true}') is not null then raise exception 'cross-owner confirmation'; end if;
 if public.line_oa_kit_confirm_chat_design(s,gen_random_uuid(),gen_random_uuid(),'fixture','{"edited":true}') is not null then raise exception 'stale session confirmation'; end if;
 if public.line_oa_kit_confirm_chat_design(s,session_id,gen_random_uuid(),'fixture','{"edited":true}') is distinct from 2 then raise exception 'confirmation did not increment the edited revision'; end if;
 if public.line_oa_kit_confirm_chat_design(s,session_id,gen_random_uuid(),'fixture','{}') is not null then raise exception 'confirmation replay overwrote the design'; end if;
 x:=public.line_oa_kit_begin_build(p,s,2,0);
 job_id:=(x->>'job_id')::uuid;
 if job_id is null then raise exception 'approved build denied'; end if;
 if (select balance from public.line_oa_kit_points_wallets where line_subject=s) is distinct from 1664 then raise exception 'incorrect maximum reservation'; end if;
 perform public.line_oa_kit_finish_build(job_id,'{}','{"model":"gpt-4.1-mini-2025-04-14","inputTokens":1000,"cachedTokens":500,"outputTokens":100}',null);
 if (select balance from public.line_oa_kit_points_wallets where line_subject=s) is distinct from 1679.8688 then raise exception 'incorrect actual usage settlement'; end if;
 x:=public.line_oa_kit_reserve_ai('fixture:review',p,s,'review',0.01);
 if (x->>'reserved')::numeric is distinct from 3.2 then raise exception 'incorrect review reservation'; end if;
 x:=public.line_oa_kit_reserve_ai('fixture:review',p,s,'review',0.01);
 if x->>'error' is distinct from 'points_request_exists' then raise exception 'duplicate reservation'; end if;
 perform public.line_oa_kit_settle_ai('fixture:review',null);
 perform public.line_oa_kit_settle_ai('fixture:review',null);
 if (select balance from public.line_oa_kit_points_wallets where line_subject=s) is distinct from 1679.8688 then raise exception 'unverified usage debited'; end if;
 if has_function_privilege('authenticated','public.line_oa_kit_settle_ai(text,jsonb)','execute')
 or has_table_privilege('anon','public.line_oa_kit_points_wallets','select') then raise exception 'wallet is client accessible'; end if;
end;
$$;
rollback;

begin;
do $$
declare
 s text:='U00000000000000000000000000000004';
 p uuid:='00000000-0000-4000-8000-000000000094';
 claim uuid;
 x jsonb;
 saved jsonb;
begin
 insert into public.line_oa_kit_designs(id,line_subject,config,revision) values(p,s,'{}',1);
 insert into public.line_oa_kit_build_access(project_id,line_subject,grant_method,setup_revision,setup)
 values(p,s,'manual_password',1,'{"audience":"本人填寫","githubRepo":"保留原網址","purpose":""}');
 x:=public.line_oa_kit_begin_prefill(p,'U00000000000000000000000000000005',1,false);
 if x->>'status' is distinct from 'stale' then raise exception 'cross-owner prefill'; end if;
 x:=public.line_oa_kit_begin_prefill(p,s,1,false);
 claim:=(x->>'claim')::uuid;
 if claim is null then raise exception 'prefill claim missing'; end if;
 x:=public.line_oa_kit_begin_prefill(p,s,1,false);
 if x->>'status' is distinct from 'running' or x?'claim' then raise exception 'concurrent duplicate prefill'; end if;
 update public.line_oa_kit_build_access set setup=jsonb_set(setup,'{failure}','"另一分頁填寫"') where project_id=p;
 if not public.line_oa_kit_finish_prefill(p,s,claim,'{"audience":"不要覆蓋","purpose":"預填建置目的","failure":"不要覆蓋","githubRepo":"不要寫入"}',0.001) then
  raise exception 'prefill failed';
 end if;
 select setup into saved from public.line_oa_kit_build_access where project_id=p;
 if saved->>'audience' is distinct from '本人填寫' or saved->>'githubRepo' is distinct from '保留原網址'
 or saved->>'purpose' is distinct from '預填建置目的' or saved->>'failure' is distinct from '另一分頁填寫' then
  raise exception 'manual or credential fields overwritten';
 end if;
 if public.line_oa_kit_finish_prefill(p,s,claim,'{}',0.001) then raise exception 'duplicate settlement'; end if;
 if has_function_privilege('authenticated','public.line_oa_kit_begin_prefill(uuid,text,integer,boolean)','execute') then raise exception 'prefill exposed'; end if;
end;$$;
rollback;
