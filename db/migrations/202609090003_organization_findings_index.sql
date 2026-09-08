-- Organization Findings (app/organizations/[organizationId]/findings) -- a real,
-- paginated, filterable cross-program report view, closing the "Findings" gap in
-- HackerOne's own documented org nav (Home / Engagements / Findings / Inbox / Assets /
-- Analytics / Hacktivity). See services/reports.ts's listReportsForOrganization.
--
-- reports only carries a (program_id, submitted_at desc) index today -- correct for
-- listReportsForProgram, but every organization-scoped query (this one, and the
-- pre-existing listOpenReportsForOrganization on the Home page) has been doing a plain
-- organization_id equality scan with no supporting index. Real at any org report volume
-- beyond the seed data this schema has been tested against so far.

create index reports_organization_id_idx on public.reports(organization_id, submitted_at desc);
