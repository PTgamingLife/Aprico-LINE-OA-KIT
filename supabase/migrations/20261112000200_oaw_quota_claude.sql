-- OAW quota calls now run on Claude Sonnet 5.5 ($2 in / $0.10 cached / $10 out per 1M tokens).
-- gpt-4.1-mini stays accepted so requests reserved before the switch can still settle.
create or replace function public.line_oa_kit_quota_settle(p_request text, p_usage jsonb)
returns numeric language plpgsql security invoker set search_path = '' as $$
declare
  u public.line_oa_kit_quota_usage%rowtype;
  rate numeric; cost numeric; refund numeric; back_t numeric; back_g numeric; back_m numeric;
  i bigint; c bigint; o bigint; p_in numeric; p_cached numeric; p_out numeric;
begin
  select * into u from public.line_oa_kit_quota_usage where request_id = p_request for update;
  if not found then raise exception 'unknown request'; end if;
  if u.used_twd is not null then return u.used_twd; end if;
  select usd_to_twd into rate from public.line_oa_kit_quota_rates where version = u.rate_version;
  if p_usage is null then
    cost := u.held_monthly + u.held_grace + u.held_topup; -- unknown outcome: keep the hold
  else
    case p_usage->>'model'
      when 'claude-sonnet-5-5' then p_in := 2.00; p_cached := 0.10; p_out := 10.00;
      when 'gpt-4.1-mini-2025-04-14' then p_in := 0.40; p_cached := 0.10; p_out := 1.60;
      else raise exception 'unsupported usage model';
    end case;
    i := (p_usage->>'inputTokens')::bigint; c := coalesce((p_usage->>'cachedTokens')::bigint, 0); o := (p_usage->>'outputTokens')::bigint;
    if i is null or o is null or c < 0 or c > i or o < 0 then raise exception 'invalid token usage'; end if;
    cost := round(((i - c) * p_in + c * p_cached + o * p_out) / 1000000 * rate, 6);
    if cost > u.held_monthly + u.held_grace + u.held_topup then raise exception 'usage exceeds reservation'; end if;
  end if;
  refund := u.held_monthly + u.held_grace + u.held_topup - cost;
  back_t := least(refund, u.held_topup); refund := refund - back_t;
  back_g := least(refund, u.held_grace); refund := refund - back_g;
  back_m := least(refund, u.held_monthly);
  update public.line_oa_kit_quota_periods
     set topup_used_twd = topup_used_twd - back_t, grace_used_twd = grace_used_twd - back_g, used_twd = used_twd - back_m
   where line_subject = u.line_subject and period_start = u.period_start;
  update public.line_oa_kit_quota_usage set used_twd = cost, usage = p_usage where request_id = p_request;
  return cost;
end;
$$;
revoke all on function public.line_oa_kit_quota_settle(text, jsonb) from public, anon, authenticated;
grant execute on function public.line_oa_kit_quota_settle(text, jsonb) to service_role;
