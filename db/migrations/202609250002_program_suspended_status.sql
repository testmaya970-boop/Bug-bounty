-- Platform program oversight, part 1: widen program_status with 'suspended' -- a
-- platform-imposed stop the organization cannot lift itself (unlike 'paused'). The new
-- enum value cannot be used in the transaction that adds it (SQLSTATE 55P04), so
-- everything that uses it lives in 202609250003, the same split 202609050016/0017 used
-- for organization_status.

alter type public.program_status add value if not exists 'suspended';
