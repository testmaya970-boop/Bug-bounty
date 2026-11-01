-- The Assistant feature (a waitlist page, 202609090006) is removed from the product.
drop function if exists public.join_hai_waitlist();
drop function if exists public.am_i_on_hai_waitlist();
drop table if exists public.hai_waitlist_entries;
