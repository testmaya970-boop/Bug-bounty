-- Organization roles, part 1: a program-level 'triager' assignment alongside 'manager'.
-- Split into its own file because a new enum value cannot be used in the transaction that
-- adds it (SQLSTATE 55P04); 202609250012 uses it.

alter type public.program_member_role add value if not exists 'triager';
