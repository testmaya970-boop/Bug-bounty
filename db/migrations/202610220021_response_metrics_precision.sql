-- get_organization_response_metrics (202610220020) rounded hours to 0.1, so anything under
-- six minutes read as "0m". Round to 0.01 h (36 s) instead; the UI formats minutes itself.
do $$
declare
  definition text;
  rewritten text;
begin
  select pg_get_functiondef('public.get_organization_response_metrics(uuid, integer)'::regprocedure) into definition;
  rewritten := replace(definition, '::numeric, 1)', '::numeric, 2)');
  if rewritten = definition then
    raise exception 'get_organization_response_metrics has no 0.1-hour rounding to change';
  end if;
  execute rewritten;
end;
$$;
