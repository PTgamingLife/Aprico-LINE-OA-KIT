-- The operator can replay the new-friend tour on their own account: the number of tour
-- messages still to go (0 = not testing).
alter table public.line_oa_kit_sec_users
  add column if not exists tour_test int not null default 0 check (tour_test between 0 and 5);
