-- Monthly subscription quota for OAW customer apps (docs/SIMPLIFIED-FLOW.md §6).
-- Replaces the unapplied points plan (20261109052449_line_ai_points.sql) for OAW billing.
--
-- Model (all amounts are NT$ of API cost; users only ever see percentages and an
-- extra bar in sale-price NT$):
--   monthly price NT$370, cost ratio 0.2  -> monthly limit = NT$74 of API cost
--   grace: sale value NT$20 once per period -> NT$4 of cost, used after the monthly limit
--   top-up: sale value P -> P * 0.2 of cost, used last
-- Every table is service_role only; no browser role has grants.

create table if not exists public.line_oa_kit_quota_rates (
  version integer primary key,
  usd_to_twd numeric(10,6) not null check (usd_to_twd > 0 and usd_to_twd <= 100),
  monthly_price_twd integer not null check (monthly_price_twd > 0),
  cost_ratio numeric(6,4) not null check (cost_ratio > 0 and cost_ratio <= 1),
  grace_price_twd integer not null check (grace_price_twd >= 0),
  created_at timestamptz not null default now()
);
insert into public.line_oa_kit_quota_rates (version, usd_to_twd, monthly_price_twd, cost_ratio, grace_price_twd)
values (1, 32, 370, 0.2, 20) on conflict (version) do nothing;

create table if not exists public.line_oa_kit_subscriptions (
  line_subject text primary key,
  status text not null check (status in ('active', 'cancelled')),
  started_on date not null,
  paid_until date not null,
  source text not null check (source in ('linepay', 'legacy', 'manual')),
  updated_at timestamptz not null default now()
);

-- One row per subscriber per monthly period (period starts on the subscription day of month).
create table if not exists public.line_oa_kit_quota_periods (
  line_subject text not null references public.line_oa_kit_subscriptions(line_subject) on delete cascade,
  period_start date not null,
  limit_twd numeric(12,6) not null,
  used_twd numeric(12,6) not null default 0 check (used_twd >= 0),
  grace_twd numeric(12,6) not null,
  grace_used_twd numeric(12,6) not null default 0 check (grace_used_twd >= 0),
  topup_twd numeric(12,6) not null default 0 check (topup_twd >= 0),
  topup_used_twd numeric(12,6) not null default 0 check (topup_used_twd >= 0),
  primary key (line_subject, period_start)
);

create table if not exists public.line_oa_kit_quota_usage (
  request_id text primary key check (length(request_id) <= 160),
  project_id uuid not null references public.line_oa_kit_designs(id) on delete cascade,
  line_subject text not null,
  period_start date not null,
  feature text not null check (feature in ('runtime', 'design', 'digest')),
  rate_version integer not null references public.line_oa_kit_quota_rates(version),
  held_monthly numeric(12,6) not null default 0,
  held_grace numeric(12,6) not null default 0,
  held_topup numeric(12,6) not null default 0,
  used_twd numeric(12,6),
  usage jsonb,
  created_at timestamptz not null default now()
);
create index if not exists line_oa_kit_quota_usage_owner_idx
  on public.line_oa_kit_quota_usage (line_subject, created_at desc);

-- Per-app API keys (hash only). Same shape as the unapplied points migration.
create table if not exists public.line_oa_kit_runtime_keys (
  project_id uuid primary key references public.line_oa_kit_designs(id) on delete cascade,
  line_subject text not null,
  key_digest text not null unique check (key_digest ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.line_oa_kit_quota_rates enable row level security;
alter table public.line_oa_kit_subscriptions enable row level security;
alter table public.line_oa_kit_quota_periods enable row level security;
alter table public.line_oa_kit_quota_usage enable row level security;
alter table public.line_oa_kit_runtime_keys enable row level security;
revoke all on public.line_oa_kit_quota_rates, public.line_oa_kit_subscriptions,
  public.line_oa_kit_quota_periods, public.line_oa_kit_quota_usage, public.line_oa_kit_runtime_keys
  from public, anon, authenticated;
grant select on public.line_oa_kit_quota_rates to service_role;
grant select, insert, update on public.line_oa_kit_subscriptions, public.line_oa_kit_quota_periods,
  public.line_oa_kit_quota_usage, public.line_oa_kit_runtime_keys to service_role;

-- Current period for an active subscriber, created on first use. Null when not subscribed.
create or replace function public.line_oa_kit_quota_period(p_subject text)
returns public.line_oa_kit_quota_periods language plpgsql security invoker set search_path = '' as $$
declare
  s public.line_oa_kit_subscriptions%rowtype;
  r public.line_oa_kit_quota_rates%rowtype;
  today date := (now() at time zone 'Asia/Taipei')::date;
  months integer;
  start date;
  p public.line_oa_kit_quota_periods%rowtype;
begin
  select * into s from public.line_oa_kit_subscriptions where line_subject = p_subject;
  if not found or s.status <> 'active' or s.paid_until < today then return null; end if;
  months := (extract(year from age(today, s.started_on)) * 12 + extract(month from age(today, s.started_on)))::integer;
  start := (s.started_on + make_interval(months => months))::date;
  select * into r from public.line_oa_kit_quota_rates order by version desc limit 1;
  insert into public.line_oa_kit_quota_periods (line_subject, period_start, limit_twd, grace_twd)
  values (p_subject, start, r.monthly_price_twd * r.cost_ratio, r.grace_price_twd * r.cost_ratio)
  on conflict (line_subject, period_start) do nothing;
  select * into p from public.line_oa_kit_quota_periods
   where line_subject = p_subject and period_start = start for update;
  return p;
end;
$$;

-- Hold the worst-case cost: monthly first, then grace, then top-up.
create or replace function public.line_oa_kit_quota_reserve(
  p_request text, p_project uuid, p_subject text, p_feature text, p_max_usd numeric)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  p public.line_oa_kit_quota_periods%rowtype;
  r public.line_oa_kit_quota_rates%rowtype;
  need numeric; m numeric; g numeric; t numeric;
begin
  if p_request is null or length(p_request) > 160 or p_max_usd is null or p_max_usd <= 0 or p_max_usd > 0.05 then
    return jsonb_build_object('error', 'invalid_reservation');
  end if;
  if exists (select 1 from public.line_oa_kit_quota_usage where request_id = p_request) then
    return jsonb_build_object('error', 'points_request_exists');
  end if;
  p := public.line_oa_kit_quota_period(p_subject);
  if p.line_subject is null then return jsonb_build_object('error', 'points_plan_required'); end if;
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

-- Charge the real cost (gpt-4.1-mini prices) and return the rest, last bucket first.
create or replace function public.line_oa_kit_quota_settle(p_request text, p_usage jsonb)
returns numeric language plpgsql security invoker set search_path = '' as $$
declare
  u public.line_oa_kit_quota_usage%rowtype;
  rate numeric; cost numeric; refund numeric; back_t numeric; back_g numeric; back_m numeric;
  i bigint; c bigint; o bigint;
begin
  select * into u from public.line_oa_kit_quota_usage where request_id = p_request for update;
  if not found then raise exception 'unknown request'; end if;
  if u.used_twd is not null then return u.used_twd; end if;
  select usd_to_twd into rate from public.line_oa_kit_quota_rates where version = u.rate_version;
  if p_usage is null then
    cost := u.held_monthly + u.held_grace + u.held_topup; -- unknown outcome: keep the hold
  else
    if p_usage->>'model' is distinct from 'gpt-4.1-mini-2025-04-14' then raise exception 'unsupported usage model'; end if;
    i := (p_usage->>'inputTokens')::bigint; c := coalesce((p_usage->>'cachedTokens')::bigint, 0); o := (p_usage->>'outputTokens')::bigint;
    if i is null or o is null or c < 0 or c > i or o < 0 then raise exception 'invalid token usage'; end if;
    cost := round(((i - c) * 0.40 + c * 0.10 + o * 1.60) / 1000000 * rate, 6);
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

-- What the app may show: percentages and the extra bar in sale-price NT$.
create or replace function public.line_oa_kit_quota_status(p_subject text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.line_oa_kit_quota_periods%rowtype; ratio numeric; s date;
begin
  p := public.line_oa_kit_quota_period(p_subject);
  if p.line_subject is null then return jsonb_build_object('paid', false); end if;
  select cost_ratio into ratio from public.line_oa_kit_quota_rates order by version desc limit 1;
  select paid_until into s from public.line_oa_kit_subscriptions where line_subject = p_subject;
  return jsonb_build_object(
    'paid', true,
    'percentLeft', greatest(0, round(100 * (p.limit_twd - p.used_twd) / p.limit_twd))::integer,
    'extraTwdLeft', floor(greatest(0, (p.grace_twd - p.grace_used_twd) + (p.topup_twd - p.topup_used_twd)) / ratio)::integer,
    'paidUntil', s);
end;
$$;

-- Operator tools (service_role only): start/extend a subscription, add a top-up.
-- Legacy buyers: call with p_source = 'legacy' and p_months = 12.
create or replace function public.line_oa_kit_subscription_extend(p_subject text, p_months integer, p_source text)
returns date language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'Asia/Taipei')::date; until date;
begin
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'invalid months'; end if;
  insert into public.line_oa_kit_subscriptions (line_subject, status, started_on, paid_until, source)
  values (p_subject, 'active', today, (today + make_interval(months => p_months))::date, p_source)
  on conflict (line_subject) do update
    set status = 'active',
        paid_until = (greatest(public.line_oa_kit_subscriptions.paid_until, today) + make_interval(months => p_months))::date,
        source = excluded.source, updated_at = now()
  returning paid_until into until;
  return until;
end;
$$;

create or replace function public.line_oa_kit_quota_topup(p_subject text, p_price_twd integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.line_oa_kit_quota_periods%rowtype; ratio numeric;
begin
  if p_price_twd is null or p_price_twd < 1 or p_price_twd > 1000 then raise exception 'invalid top-up'; end if;
  p := public.line_oa_kit_quota_period(p_subject);
  if p.line_subject is null then return jsonb_build_object('error', 'points_plan_required'); end if;
  select cost_ratio into ratio from public.line_oa_kit_quota_rates order by version desc limit 1;
  update public.line_oa_kit_quota_periods set topup_twd = topup_twd + p_price_twd * ratio
   where line_subject = p_subject and period_start = p.period_start;
  return public.line_oa_kit_quota_status(p_subject);
end;
$$;

revoke all on function public.line_oa_kit_quota_period(text), public.line_oa_kit_quota_reserve(text, uuid, text, text, numeric),
  public.line_oa_kit_quota_settle(text, jsonb), public.line_oa_kit_quota_status(text),
  public.line_oa_kit_subscription_extend(text, integer, text), public.line_oa_kit_quota_topup(text, integer)
  from public, anon, authenticated;
grant execute on function public.line_oa_kit_quota_period(text), public.line_oa_kit_quota_reserve(text, uuid, text, text, numeric),
  public.line_oa_kit_quota_settle(text, jsonb), public.line_oa_kit_quota_status(text),
  public.line_oa_kit_subscription_extend(text, integer, text), public.line_oa_kit_quota_topup(text, integer)
  to service_role;
