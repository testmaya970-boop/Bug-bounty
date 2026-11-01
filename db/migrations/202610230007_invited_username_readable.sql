-- program_invitations is read through column grants (token_hash stays unreadable); the column
-- added in 202610230006 needs its own grant, or the managers' invitation list fails.
grant select (invited_username) on public.program_invitations to authenticated;
