-- 202609240002 created program_access_files with RLS policies but never granted the
-- base table-level SELECT to `authenticated` -- an RLS policy only narrows which ROWS a
-- grant already allows; without the grant itself, every direct SELECT against this table
-- fails outright regardless of policy, exactly the gap program_scope_entries/
-- report_evidence already avoid (both explicitly grant select to authenticated
-- alongside their own RLS policies). Found live: getProgramAccessFile threw
-- "permission denied for table program_access_files" for every caller, including a
-- program's own manager, the moment the program detail page tried to read it.
--
-- No insert/update/delete grant to authenticated: every write already goes through the
-- SECURITY DEFINER functions in 202609240002 (upload_program_access_file,
-- remove_program_access_file), which do not need table-level grants themselves --
-- identical reasoning to why report_evidence/program_scope_entries also grant
-- authenticated select only, never write.

grant select on public.program_access_files to authenticated;
