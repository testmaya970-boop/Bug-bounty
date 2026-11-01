-- 202610220002 approves access requests with source 'request'; the enum didn't have it.
alter type public.program_access_source add value if not exists 'request';
