-- Audit PERF-1 (P0). list_public_disclosures (202609030001) is callable by `anon` and had no
-- LIMIT, so every anonymous hit on /disclosures read and joined the entire approved feed.
-- Capped at the 100 most recent entries, and the sort is now index-backed (the existing
-- partial index covered the filter but not the order by).
-- ponytail: fixed 100-row window; add keyset paging (p_before published_at) when the feed
-- needs a "load more".

create index if not exists report_disclosures_approved_published_idx
  on public.report_disclosures (published_at desc) where status = 'approved';

create or replace function public.list_public_disclosures()
returns table (
  report_id uuid,
  published_title text,
  published_summary text,
  confirmed_severity public.report_severity,
  program_name text,
  organization_name text,
  published_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select d.report_id, d.published_title, d.published_summary, r.confirmed_severity, p.name, o.name, d.published_at
    from public.report_disclosures d
    join public.reports r on r.id = d.report_id
    join public.programs p on p.id = r.program_id
    join public.organizations o on o.id = r.organization_id
    where d.status = 'approved'
    order by d.published_at desc
    limit 100;
end;
$$;

revoke all on function public.list_public_disclosures() from public;
grant execute on function public.list_public_disclosures() to anon, authenticated;
