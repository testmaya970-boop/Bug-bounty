-- The 8-argument wrapper (202610260006) needs no privileges of its own: it runs as the caller
-- and the 15-argument submit_report it calls is the SECURITY DEFINER function that does every
-- authorization check. Security invoker, so no definer function exists without a guard.
create or replace function public.submit_report(
  target_program_id uuid, p_asset_type public.program_asset_type, target_input text, p_title text, p_description text,
  p_weakness_type public.report_weakness_type, p_impact text, p_researcher_severity public.report_severity
)
returns public.reports
language sql security invoker set search_path = ''
as $$
  select * from public.submit_report(target_program_id, p_asset_type, target_input, p_title, p_description, p_weakness_type, p_impact, p_researcher_severity,
    null::uuid, null::text, null::text, null::numeric, null::uuid, null::uuid[], null::uuid);
$$;
