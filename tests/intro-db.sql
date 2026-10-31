-- Transactional integration test. No HTTP calls or real sends; always rolls back.
begin;
set local statement_timeout='10s';
insert into public.line_oa_kit_intro_control(id,cards,enabled,welcome_enabled,enabled_at)
values(true,'[{},{}]'::jsonb,true,true,now()-interval '1 hour')
on conflict(id) do update set enabled=true,welcome_enabled=true,enabled_at=now()-interval '1 hour';
do $$
declare s text:='Uffffffffffffffffffffffffffffff01'; f jsonb; j jsonb; second_id uuid; checked jsonb:='{"basicId":"@228srwlt","estimatedMessages":1,"remaining":200,"unlimited":false}';
begin
 if exists(select 1 from public.line_oa_kit_intro_members where subject=s) then raise exception 'fixture_collision'; end if;
 f:=public.line_oa_kit_intro_follow(s,'intro-fixture-one','follow',now(),false);
 if f->>'firstJob' is null then raise exception 'enrollment_failed'; end if;
 if public.line_oa_kit_intro_follow(s,'intro-fixture-one','follow',now(),false)<>'{}'::jsonb then raise exception 'duplicate_enrollment'; end if;
 if (select count(*) from public.line_oa_kit_intro_jobs where subject=s)<>2 then raise exception 'two_jobs_required'; end if;
 select id into second_id from public.line_oa_kit_intro_jobs where subject=s and card=2;
 if public.line_oa_kit_intro_claim(second_id)<>'{}'::jsonb then raise exception 'second_before_first'; end if;
 j:=public.line_oa_kit_intro_claim((f->>'firstJob')::uuid);
 if j->>'status'<>'preflight' then raise exception 'claim_failed'; end if;
 if public.line_oa_kit_intro_claim((f->>'firstJob')::uuid)<>'{}'::jsonb then raise exception 'claim_replay'; end if;
 if public.line_oa_kit_intro_begin((j->>'id')::uuid,(j->>'claim_key')::uuid,jsonb_set(checked,'{basicId}','"@wrong"')) then raise exception 'wrong_oa_allowed'; end if;
 if not public.line_oa_kit_intro_begin((j->>'id')::uuid,(j->>'claim_key')::uuid,checked) then raise exception 'begin_failed'; end if;
 if not public.line_oa_kit_intro_finish((j->>'id')::uuid,(j->>'claim_key')::uuid,'accepted',null,'fixture-only') then raise exception 'finish_failed'; end if;
 if not exists(select 1 from public.line_oa_kit_intro_jobs where id=second_id and scheduled_at>=now()+interval '24 hours') then raise exception 'second_interval_wrong'; end if;
 if public.line_oa_kit_intro_claim(second_id)<>'{}'::jsonb then raise exception 'second_not_due'; end if;
 update public.line_oa_kit_intro_jobs set scheduled_at=now()-interval '1 second' where id=second_id;
 j:=public.line_oa_kit_intro_claim(second_id);
 perform public.line_oa_kit_intro_begin(second_id,(j->>'claim_key')::uuid,checked);
 perform public.line_oa_kit_intro_finish(second_id,(j->>'claim_key')::uuid,'unknown','delivery_uncertain');
 if public.line_oa_kit_intro_claim(second_id)<>'{}'::jsonb then raise exception 'unknown_retried'; end if;
 perform public.line_oa_kit_intro_follow(s,'intro-fixture-unfollow','unfollow',now(),false);
 if exists(select 1 from public.line_oa_kit_intro_members where subject=s and active) then raise exception 'unfollow_failed'; end if;
 perform public.line_oa_kit_intro_follow(s,'intro-fixture-unblock','follow',now(),true);
 if (select count(*) from public.line_oa_kit_intro_jobs where subject=s)<>2 then raise exception 'unblock_restarted'; end if;
 -- Disabled enrollment, stale event, and old friend's unblock produce no jobs.
 if public.line_oa_kit_intro_follow('Uffffffffffffffffffffffffffffff02','intro-unblock-only','follow',now(),true)<>'{}'::jsonb then raise exception 'unblock_enrolled'; end if;
 if public.line_oa_kit_intro_follow('Uffffffffffffffffffffffffffffff03','intro-old','follow',now()-interval '2 hours',false)<>'{}'::jsonb then raise exception 'old_event_enrolled'; end if;
 update public.line_oa_kit_intro_control set enabled=false where id;
 if public.line_oa_kit_intro_follow('Uffffffffffffffffffffffffffffff04','intro-disabled','follow',now(),false)<>'{}'::jsonb then raise exception 'disabled_enrollment'; end if;
end $$;
rollback;
select 'intro_db_checks_passed_no_sends' as result;
