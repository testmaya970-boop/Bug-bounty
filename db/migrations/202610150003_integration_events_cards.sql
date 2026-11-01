-- Card funding (202610150002) logs its provider calls and webhooks to Platform > Integrations.
alter table public.integration_events drop constraint integration_events_module_check;
alter table public.integration_events add constraint integration_events_module_check check (module in ('identity', 'payments', 'phone', 'cards'));
