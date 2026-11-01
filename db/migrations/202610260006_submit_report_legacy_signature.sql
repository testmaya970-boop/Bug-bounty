-- Backward compatibility: the original 8-argument submit_report, as a thin wrapper over the
-- 15-argument version (202610260004). Seed scripts, database tests and any older caller keep
-- working unchanged. Same checks, same scope decision (the server's own most-specific match);
-- just no chosen scope entry, CVSS, draft, staged files or submission key. Not ambiguous: the
-- new signature has no defaults, so 8 positional arguments can only resolve here.
create or replace function public.submit_report(
  target_program_id uuid, p_asset_type public.program_asset_type, target_input text, p_title text, p_description text,
  p_weakness_type public.report_weakness_type, p_impact text, p_researcher_severity public.report_severity
)
returns public.reports
language sql security definer set search_path = ''
as $$
  select * from public.submit_report(target_program_id, p_asset_type, target_input, p_title, p_description, p_weakness_type, p_impact, p_researcher_severity,
    null::uuid, null::text, null::text, null::numeric, null::uuid, null::uuid[], null::uuid);
$$;
revoke all on function public.submit_report(uuid, public.program_asset_type, text, text, text, public.report_weakness_type, text, public.report_severity) from public, anon;
grant execute on function public.submit_report(uuid, public.program_asset_type, text, text, text, public.report_weakness_type, text, public.report_severity) to authenticated;
