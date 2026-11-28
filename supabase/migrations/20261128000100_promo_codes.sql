-- 加值碼: a code the operator hands out (e.g. at a class) that grants free months of
-- membership. Only the SHA-256 of the lower-cased code is stored; a code has a deadline and a
-- maximum number of accounts, and each account can use it once.
create table if not exists public.line_oa_kit_promo_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  months int not null check (months between 1 and 12),
  max_uses int not null check (max_uses > 0),
  valid_until timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.line_oa_kit_promo_uses (
  code_hash text not null references public.line_oa_kit_promo_codes(code_hash) on delete cascade,
  line_subject text not null check (line_subject ~ '^U[0-9a-f]{32}$'),
  used_at timestamptz not null default now(),
  primary key (code_hash, line_subject)
);
-- Wrong guesses per account per day, so a code cannot be found by trying.
create table if not exists public.line_oa_kit_promo_tries (
  line_subject text not null,
  day date not null,
  tries int not null default 0,
  primary key (line_subject, day)
);
alter table public.line_oa_kit_promo_codes enable row level security;
alter table public.line_oa_kit_promo_uses enable row level security;
alter table public.line_oa_kit_promo_tries enable row level security;
revoke all on public.line_oa_kit_promo_codes, public.line_oa_kit_promo_uses, public.line_oa_kit_promo_tries
  from public, anon, authenticated;

create or replace function public.line_oa_kit_promo_redeem(p_subject text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.line_oa_kit_promo_codes; today date := (now() at time zone 'Asia/Taipei')::date;
  h text := encode(extensions.digest(lower(trim(coalesce(p_code, ''))), 'sha256'), 'hex'); until date;
begin
  if p_subject !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('error', 'unknown'); end if;
  if coalesce((select tries from public.line_oa_kit_promo_tries where line_subject = p_subject and day = today), 0) >= 10 then
    return jsonb_build_object('error', 'too_many');
  end if;
  select * into c from public.line_oa_kit_promo_codes where code_hash = h for update;
  if not found then
    insert into public.line_oa_kit_promo_tries (line_subject, day, tries) values (p_subject, today, 1)
      on conflict (line_subject, day) do update set tries = public.line_oa_kit_promo_tries.tries + 1;
    return jsonb_build_object('error', 'unknown');
  end if;
  if now() > c.valid_until then return jsonb_build_object('error', 'expired'); end if;
  if exists (select 1 from public.line_oa_kit_promo_uses where code_hash = h and line_subject = p_subject) then
    return jsonb_build_object('error', 'already');
  end if;
  if (select count(*) from public.line_oa_kit_promo_uses where code_hash = h) >= c.max_uses then
    return jsonb_build_object('error', 'full');
  end if;
  insert into public.line_oa_kit_promo_uses (code_hash, line_subject) values (h, p_subject);
  until := public.line_oa_kit_subscription_extend(p_subject, c.months, 'manual');
  return jsonb_build_object('ok', true, 'months', c.months, 'paidUntil', until);
end;
$$;
revoke all on function public.line_oa_kit_promo_redeem(text, text) from public, anon, authenticated;
grant execute on function public.line_oa_kit_promo_redeem(text, text) to service_role;
