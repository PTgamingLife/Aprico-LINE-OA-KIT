-- Preserve historical order amounts. Only newly created orders use the new price.
alter table public.line_oa_kit_payments drop constraint line_oa_kit_payments_amount_check;
alter table public.line_oa_kit_payments add constraint line_oa_kit_payments_amount_check check(amount in (1890,3860));
alter table public.line_oa_kit_payments alter column amount set default 3860;
