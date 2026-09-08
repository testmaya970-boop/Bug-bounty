-- Adds the 'file' value to report_evidence_type ahead of
-- 202608270005_binary_evidence_storage.sql, which uses it in check constraints.
-- Split into its own migration deliberately: PostgreSQL refuses to use a freshly-added
-- enum value inside a CHECK constraint within the same transaction that added it
-- (SQLSTATE 55P04, "unsafe use of new value of enum type") -- confirmed live when first
-- attempted as one migration file. Supabase applies each migration file as one
-- transaction, so the new value must be committed in a prior migration before anything
-- can reference it in a constraint.
alter type public.report_evidence_type add value 'file';
