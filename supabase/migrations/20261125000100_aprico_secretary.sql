-- Aprico OA as a secretary: every friend can try 5 messages (lifetime), a referral gift
-- opens a 3-day trial (20 a day), members get 20 a day here until their own OA is built.
-- Also: referral codes, the trial calendar, and problem reports for the nightly summary.
create table if not exists public.line_oa_kit_sec_users (
  line_user_id text primary key check (line_user_id ~ '^U[0-9a-f]{32}$'),
  free_used int not null default 0,
  ref_code text not null unique,
  referred_by text,
  refs int not null default 0,
  gift_opened_at timestamptz,
  trial_until timestamptz,
  day date,
  day_used int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.line_oa_kit_sec_events (
  id bigint generated always as identity primary key,
  line_user_id text not null,
  day date not null,
  time text not null default '',
  title text not null check (length(title) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists line_oa_kit_sec_events_user_idx
  on public.line_oa_kit_sec_events (line_user_id, day);
create table if not exists public.line_oa_kit_sec_reports (
  id bigint generated always as identity primary key,
  line_user_id text not null,
  text text not null check (length(text) between 1 and 500),
  created_at timestamptz not null default now(),
  digested_at timestamptz
);
create table if not exists public.line_oa_kit_sec_budget (
  day date primary key,
  calls int not null default 0
);

alter table public.line_oa_kit_sec_users enable row level security;
alter table public.line_oa_kit_sec_events enable row level security;
alter table public.line_oa_kit_sec_reports enable row level security;
alter table public.line_oa_kit_sec_budget enable row level security;
revoke all on public.line_oa_kit_sec_users, public.line_oa_kit_sec_events,
  public.line_oa_kit_sec_reports, public.line_oa_kit_sec_budget from public, anon, authenticated;
grant select on public.line_oa_kit_sec_users to service_role;
grant select, insert, delete on public.line_oa_kit_sec_events to service_role;
grant select, insert, update on public.line_oa_kit_sec_reports to service_role;

-- Make sure a user row exists (with a referral code like 7K2M) and return it.
create or replace function public.line_oa_kit_sec_user(p_user text)
returns public.line_oa_kit_sec_users language plpgsql security definer set search_path = '' as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int; u public.line_oa_kit_sec_users;
begin
  select * into u from public.line_oa_kit_sec_users where line_user_id = p_user;
  if found then return u; end if;
  loop
    code := '';
    for i in 1..4 loop
      code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    insert into public.line_oa_kit_sec_users (line_user_id, ref_code) values (p_user, code)
      on conflict do nothing returning * into u;
    if found then return u; end if;
    select * into u from public.line_oa_kit_sec_users where line_user_id = p_user;
    if found then return u; end if;
  end loop;
end;
$$;

-- May this user send one more message to the secretary? p_commit counts it.
-- kind: member (20/day) > trial (20/day) > free (5 in total). 3000 calls a day in all.
create or replace function public.line_oa_kit_sec_take(p_user text, p_commit boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u public.line_oa_kit_sec_users; today date := (now() at time zone 'Asia/Taipei')::date;
  used int; kind text; lim int; spent int;
begin
  u := public.line_oa_kit_sec_user(p_user);
  select * into u from public.line_oa_kit_sec_users where line_user_id = p_user for update;
  used := case when u.day = today then u.day_used else 0 end;
  if exists (select 1 from public.line_oa_kit_subscriptions
             where line_subject = p_user and status = 'active' and paid_until >= today) then kind := 'member';
  elsif u.trial_until > now() then kind := 'trial';
  else kind := 'free'; end if;
  if kind = 'free' then lim := 5; spent := u.free_used; else lim := 20; spent := used; end if;
  if spent >= lim then return jsonb_build_object('allowed', false, 'kind', kind, 'left', 0); end if;
  if coalesce((select calls from public.line_oa_kit_sec_budget where day = today), 0) >= 3000 then
    return jsonb_build_object('allowed', false, 'kind', 'busy', 'left', lim - spent);
  end if;
  if p_commit then
    insert into public.line_oa_kit_sec_budget (day, calls) values (today, 1)
      on conflict (day) do update set calls = public.line_oa_kit_sec_budget.calls + 1;
    if kind = 'free' then
      update public.line_oa_kit_sec_users set free_used = free_used + 1 where line_user_id = p_user;
    else
      update public.line_oa_kit_sec_users set day = today, day_used = used + 1 where line_user_id = p_user;
    end if;
    spent := spent + 1;
  end if;
  return jsonb_build_object('allowed', true, 'kind', kind, 'left', lim - spent);
end;
$$;

-- A new friend enters someone's referral code. Once per user; never their own code.
create or replace function public.line_oa_kit_sec_refer(p_user text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.line_oa_kit_sec_users; other public.line_oa_kit_sec_users;
begin
  me := public.line_oa_kit_sec_user(p_user);
  select * into me from public.line_oa_kit_sec_users where line_user_id = p_user for update;
  if me.referred_by is not null then return jsonb_build_object('ok', false, 'error', 'already'); end if;
  select * into other from public.line_oa_kit_sec_users where ref_code = upper(p_code);
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown'); end if;
  if other.line_user_id = p_user then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  update public.line_oa_kit_sec_users set referred_by = other.line_user_id where line_user_id = p_user;
  update public.line_oa_kit_sec_users set refs = refs + 1 where line_user_id = other.line_user_id
    returning * into other;
  return jsonb_build_object('ok', true, 'referrer', other.line_user_id, 'refs', other.refs);
end;
$$;

-- Open the gift orb: 3 days of trial, once, after at least one referral.
create or replace function public.line_oa_kit_sec_gift(p_user text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u public.line_oa_kit_sec_users;
begin
  u := public.line_oa_kit_sec_user(p_user);
  update public.line_oa_kit_sec_users
    set gift_opened_at = now(), trial_until = now() + interval '3 days'
    where line_user_id = p_user and refs >= 1 and gift_opened_at is null
    returning * into u;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'trial_until', u.trial_until);
end;
$$;

revoke all on function public.line_oa_kit_sec_user(text), public.line_oa_kit_sec_take(text, boolean),
  public.line_oa_kit_sec_refer(text, text), public.line_oa_kit_sec_gift(text) from public, anon, authenticated;
grant execute on function public.line_oa_kit_sec_user(text), public.line_oa_kit_sec_take(text, boolean),
  public.line_oa_kit_sec_refer(text, text), public.line_oa_kit_sec_gift(text) to service_role;
