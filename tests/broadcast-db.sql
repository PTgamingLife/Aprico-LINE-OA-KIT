-- All temporary fixtures roll back; no LINE API is called.
begin;
do $$
declare s text:='U00000000000000000000000000000000';
 d uuid:='00000000-0000-4000-8000-000000000001';
 x jsonb; i integer;
begin
 insert into public.line_oa_kit_broadcasts(id,line_subject,config,status,revision,confirm_hash,prepared_until)
 values(d,s,'{}','prepared',2,repeat('a',64),now()+interval '5 minutes');
 x:=public.line_oa_kit_claim_broadcast(s,d,2,null,repeat('a',64));
 if x->>'error'<>'invalid_mode' then raise exception 'null mode allowed'; end if;
 x:=public.line_oa_kit_claim_broadcast(s,d,null,'broadcast',repeat('a',64));
 if x->>'error'<>'not_ready' then raise exception 'null revision allowed'; end if;
 x:=public.line_oa_kit_claim_broadcast(s,d,2,'broadcast',null);
 if x->>'error'<>'confirmation_expired' then raise exception 'null confirmation allowed'; end if;
 x:=public.line_oa_kit_claim_broadcast('U11111111111111111111111111111111',d,2,'broadcast',repeat('a',64));
 if x->>'error'<>'not_ready' then raise exception 'other subject allowed'; end if;
 x:=public.line_oa_kit_claim_broadcast(s,d,2,'broadcast',repeat('b',64));
 if x->>'error'<>'confirmation_expired' then raise exception 'wrong confirmation allowed'; end if;
 x:=public.line_oa_kit_claim_broadcast(s,d,2,'broadcast',repeat('a',64));
 if x->'draft'->>'status'<>'sending' then raise exception 'claim did not start'; end if;
 x:=public.line_oa_kit_claim_broadcast(s,d,2,'broadcast',repeat('a',64));
 if x->>'error'<>'not_ready' then raise exception 'duplicate send allowed'; end if;
 insert into public.line_oa_kit_broadcasts(id,line_subject,config,status,revision,confirm_hash,prepared_until)
 values('00000000-0000-4000-8000-000000000002',s,'{}','prepared',2,repeat('a',64),now()+interval '5 minutes');
 x:=public.line_oa_kit_claim_broadcast(s,'00000000-0000-4000-8000-000000000002',2,'broadcast',repeat('a',64));
 if x->>'error'<>'send_too_soon' then raise exception 'minute throttle missing'; end if;
 update public.line_oa_kit_broadcasts set send_started_at=now()-interval '2 minutes' where id=d;
 for i in 3..6 loop
  insert into public.line_oa_kit_broadcasts(id,line_subject,config,status,send_started_at)
  values(('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,s,'{}','accepted',now()-interval '2 minutes');
 end loop;
 x:=public.line_oa_kit_claim_broadcast(s,'00000000-0000-4000-8000-000000000002',2,'broadcast',repeat('a',64));
 if x->>'error'<>'daily_limit' then raise exception 'daily throttle missing'; end if;
 x:=public.line_oa_kit_claim_broadcast(s,'00000000-0000-4000-8000-000000000002',2,'test','');
 if x->'draft'->>'test_status'<>'sending' then raise exception 'test claim failed'; end if;
 x:=public.line_oa_kit_claim_broadcast(s,'00000000-0000-4000-8000-000000000002',2,'test','');
 if x->>'error'<>'test_already_claimed' then raise exception 'duplicate test allowed'; end if;
end; $$;
select 'claims, isolation, throttle and single-use confirmation passed' as result;
rollback;
