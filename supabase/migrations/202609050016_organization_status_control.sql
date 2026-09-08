-- Organization-status control, part 1: widen organization_status to add 'suspended'.
-- Postgres forbids using a brand-new enum value in the same transaction that added it
-- (SQLSTATE 55P04), and `supabase db reset` applies all migrations in one transaction --
-- so the new value is added here, in its own migration file, and everything that USES it
-- (the operability helper, suspend/reinstate RPCs, and every write-path redefinition) is
-- in the next migration (202609050017), matching the same split this session already used
-- successfully for 'escalated' on report_mediation_status/report_retest_status.
--
-- See 202609050017's own header comment for the full design rationale (why this state is
-- needed, which write paths are gated, which are deliberately not, and the disclosed
-- single-admin/no-dual-control limitation).

alter type public.organization_status add value if not exists 'suspended';
