-- Execute only AFTER SQL tests, read-only LINE preflight, and both Edge deployments.
-- User approved overlapping global broadcasts/new-friend pushes (possible duplicates).
begin;
do $$
begin
 if now()>='2026-10-31T01:00:00Z'::timestamptz then raise exception 'schedule_deadline_passed_get_user_direction'; end if;
 if not exists(select 1 from public.line_oa_kit_intro_control where id and not enabled and last_check_at>now()-interval '15 minutes' and last_check->>'ok'='true') then raise exception 'fresh_preflight_required'; end if;
 if (select count(*) from public.line_oa_kit_intro_jobs where dedupe_key in ('aprico-intro-20261031-1','aprico-intro-20261101-2') and kind='broadcast' and status='pending' and scheduled_at>now())<>2 then raise exception 'two_future_jobs_required'; end if;
 update public.line_oa_kit_intro_control set enabled=true,welcome_enabled=true,enabled_at=now() where id;
 perform cron.schedule('aprico-intro-delivery','* * * * *',$cron$select line_oa_kit_internal.invoke_intro('run');$cron$);
end $$;
commit;
