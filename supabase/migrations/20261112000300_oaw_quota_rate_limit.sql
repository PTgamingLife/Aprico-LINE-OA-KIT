-- Abuse limits for OAW quota calls: a leaked app key cannot burst through an owner's quota.
-- Also raises the per-call hold cap to US$0.10 for photo analysis (看健).
-- Hold the worst-case cost: monthly first, then grace, then top-up.
-- Per owner at most 20 calls a minute and 500 a day (Asia/Taipei), across all features.
create or replace function public.line_oa_kit_quota_reserve(
  p_request text, p_project uuid, p_subject text, p_feature text, p_max_usd numeric)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  p public.line_oa_kit_quota_periods%rowtype;
  r public.line_oa_kit_quota_rates%rowtype;
  need numeric; m numeric; g numeric; t numeric;
begin
  if p_request is null or length(p_request) > 160 or p_max_usd is null or p_max_usd <= 0 or p_max_usd > 0.10 then
    return jsonb_build_object('error', 'invalid_reservation');
  end if;
  if exists (select 1 from public.line_oa_kit_quota_usage where request_id = p_request) then
    return jsonb_build_object('error', 'points_request_exists');
  end if;
  p := public.line_oa_kit_quota_period(p_subject);
  if p.line_subject is null then return jsonb_build_object('error', 'points_plan_required'); end if;
  -- Serialize this owner's reservations, then cap bursts and daily volume.
  perform 1 from public.line_oa_kit_quota_periods
   where line_subject = p_subject and period_start = p.period_start for update;
  if (select count(*) from public.line_oa_kit_quota_usage
       where line_subject = p_subject and created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.line_oa_kit_quota_usage
       where line_subject = p_subject
         and created_at >= ((now() at time zone 'Asia/Taipei')::date)::timestamp at time zone 'Asia/Taipei') >= 500 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  select * into r from public.line_oa_kit_quota_rates order by version desc limit 1;
  need := round(p_max_usd * r.usd_to_twd, 6);
  m := least(need, greatest(p.limit_twd - p.used_twd, 0));
  g := least(need - m, greatest(p.grace_twd - p.grace_used_twd, 0));
  t := least(need - m - g, greatest(p.topup_twd - p.topup_used_twd, 0));
  if m + g + t < need then return jsonb_build_object('error', 'points_insufficient'); end if;
  update public.line_oa_kit_quota_periods
     set used_twd = used_twd + m, grace_used_twd = grace_used_twd + g, topup_used_twd = topup_used_twd + t
   where line_subject = p_subject and period_start = p.period_start;
  insert into public.line_oa_kit_quota_usage
    (request_id, project_id, line_subject, period_start, feature, rate_version, held_monthly, held_grace, held_topup)
  values (p_request, p_project, p_subject, p.period_start, p_feature, r.version, m, g, t);
  return jsonb_build_object('reserved', need, 'bucket', case when t > 0 then 'topup' when g > 0 then 'grace' else 'monthly' end);
end;
$$;
revoke all on function public.line_oa_kit_quota_reserve(text, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.line_oa_kit_quota_reserve(text, uuid, text, text, numeric) to service_role;
