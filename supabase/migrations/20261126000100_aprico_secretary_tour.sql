-- The free secretary's five-step tour keeps more than calendar entries: expenses, todos and
-- (as a demonstration only) a reminder. Existing rows are calendar entries.
alter table public.line_oa_kit_sec_events
  add column if not exists kind text not null default 'event'
    check (kind in ('event', 'expense', 'todo', 'remind')),
  add column if not exists amount int check (amount is null or (amount >= 0 and amount <= 10000000));
