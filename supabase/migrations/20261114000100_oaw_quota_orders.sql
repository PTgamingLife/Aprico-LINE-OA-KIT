-- LINE Pay orders for the OAW subscription (monthly NT$370, yearly NT$3,870) and quota
-- top-ups (NT$30 / NT$50), plus daily renewal reminders. Only a production payment grants
-- anything; sandbox payments end as test_paid. Settling is atomic and idempotent.
create table if not exists public.line_oa_kit_quota_orders (
  id uuid primary key default gen_random_uuid(),
  line_subject text not null check (line_subject ~ '^U[0-9a-f]{32}$'),
  product text not null check (product in ('month', 'year', 'topup30', 'topup50')),
  amount integer not null check (amount > 0),
  currency text not null default 'TWD',
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null default 'requesting'
    check (status in ('requesting', 'pending', 'confirming', 'paid', 'test_paid', 'cancelled', 'unknown')),
  transaction_id text,
  payment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists line_oa_kit_quota_orders_owner_idx
  on public.line_oa_kit_quota_orders (line_subject, created_at desc);

-- Prices live here so the API and the database agree on what each product costs.
create or replace function public.line_oa_kit_quota_product_price(p_product text)
returns integer language sql immutable set search_path = '' as $$
  select case p_product when 'month' then 370 when 'year' then 3870
    when 'topup30' then 30 when 'topup50' then 50 end;
$$;

create or replace function public.line_oa_kit_quota_order_settle(p_order uuid, p_subject text, p_transaction text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.line_oa_kit_quota_orders%rowtype; result jsonb;
begin
  select * into o from public.line_oa_kit_quota_orders
   where id = p_order and line_subject = p_subject for update;
  if not found then return jsonb_build_object('error', 'order_not_found'); end if;
  if o.status in ('paid', 'test_paid') then return jsonb_build_object('status', o.status, 'already', true); end if;
  if o.status not in ('pending', 'confirming') or o.transaction_id is distinct from p_transaction then
    return jsonb_build_object('error', 'order_state');
  end if;
  if o.environment <> 'production' then
    update public.line_oa_kit_quota_orders set status = 'test_paid', settled_at = now(), updated_at = now() where id = o.id;
    return jsonb_build_object('status', 'test_paid');
  end if;
  if o.product = 'month' then
    result := jsonb_build_object('paidUntil', public.line_oa_kit_subscription_extend(p_subject, 1, 'linepay'));
  elsif o.product = 'year' then
    result := jsonb_build_object('paidUntil', public.line_oa_kit_subscription_extend(p_subject, 12, 'linepay'));
  else
    result := public.line_oa_kit_quota_topup(p_subject, o.amount);
    if result ? 'error' then return result; end if;
  end if;
  update public.line_oa_kit_quota_orders set status = 'paid', settled_at = now(), updated_at = now() where id = o.id;
  return result || jsonb_build_object('status', 'paid');
end;
$$;

-- One reminder per subscription end date and kind ('soon' = 3 days before, 'due' = on the day).
create table if not exists public.line_oa_kit_billing_reminders (
  line_subject text not null,
  paid_until date not null,
  kind text not null check (kind in ('soon', 'due')),
  sent_at timestamptz not null default now(),
  primary key (line_subject, paid_until, kind)
);

-- Subscriptions that need a reminder today (Asia/Taipei) and have not had it yet.
create or replace function public.line_oa_kit_billing_due()
returns table (line_subject text, paid_until date, kind text)
language sql stable set search_path = '' as $$
  with today as (select (now() at time zone 'Asia/Taipei')::date as d)
  select s.line_subject, s.paid_until, k.kind
    from public.line_oa_kit_subscriptions s, today,
         lateral (values ('soon', s.paid_until - 3), ('due', s.paid_until)) as k(kind, on_day)
   where s.status = 'active' and k.on_day = today.d
     and not exists (select 1 from public.line_oa_kit_billing_reminders r
                      where r.line_subject = s.line_subject and r.paid_until = s.paid_until and r.kind = k.kind);
$$;

alter table public.line_oa_kit_quota_orders enable row level security;
alter table public.line_oa_kit_billing_reminders enable row level security;
revoke all on public.line_oa_kit_quota_orders, public.line_oa_kit_billing_reminders from public, anon, authenticated;
grant select, insert, update on public.line_oa_kit_quota_orders, public.line_oa_kit_billing_reminders to service_role;
revoke all on function public.line_oa_kit_quota_order_settle(uuid, text, text), public.line_oa_kit_billing_due()
  from public, anon, authenticated;
grant execute on function public.line_oa_kit_quota_order_settle(uuid, text, text), public.line_oa_kit_billing_due(),
  public.line_oa_kit_quota_product_price(text) to service_role;

-- Daily trigger, same pattern as the intro delivery: a one-use tick token, stored hashed.
create schema if not exists line_oa_kit_internal;
create table if not exists public.line_oa_kit_billing_ticks (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.line_oa_kit_billing_ticks enable row level security;
revoke all on public.line_oa_kit_billing_ticks from public, anon, authenticated;
grant select, delete on public.line_oa_kit_billing_ticks to service_role;

create or replace function line_oa_kit_internal.invoke_billing_reminders()
returns bigint language plpgsql set search_path = '' as $$
declare k text; request bigint;
begin
  delete from public.line_oa_kit_billing_ticks where created_at < now() - interval '7 days';
  k := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.line_oa_kit_billing_ticks (token_hash, expires_at)
    values (encode(extensions.digest(k, 'sha256'), 'hex'), now() + interval '90 seconds');
  select net.http_post(
    url := 'https://hhcubvixldieuwdeqnwc.supabase.co/functions/v1/line-oa-kit-runtime-ai/billing-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-billing-tick', k),
    body := '{}'::jsonb, timeout_milliseconds := 60000) into request;
  return request;
end;
$$;
revoke all on function line_oa_kit_internal.invoke_billing_reminders() from public, anon, authenticated;

-- 10:07 Asia/Taipei every day.
select cron.schedule('aprico-billing-reminders', '7 2 * * *', 'select line_oa_kit_internal.invoke_billing_reminders();');
