-- The dashboard action center also says whether identity verification still blocks reporting,
-- from the same rule submit_report enforces (private.researcher_has_verified_kyc).
drop function public.get_my_researcher_actions();

create function public.get_my_researcher_actions()
returns table (collaboration_invitations bigint, acknowledgements_to_answer bigint, mentorship_requests_to_answer bigint, cve_eligible_reports bigint, unaccepted_agreements bigint, upcoming_events bigint, identity_verified boolean)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from public.report_collaboration_invitations i join public.reports r on r.id = i.report_id
      where i.invitee_id = auth.uid() and i.status = 'pending' and r.status in ('new', 'triaging')),
    (select count(*) from public.program_acknowledgements where researcher_id = auth.uid() and status = 'proposed'),
    (select count(*) from public.mentorship_requests where mentor_id = auth.uid() and status = 'pending'),
    (select count(*) from public.list_my_cve_eligible_reports()),
    (select count(*) from public.list_my_agreements() a where a.kind = 'platform' and a.accepted_at is null),
    (select count(*) from public.hacking_event_registrations g join public.hacking_events e on e.id = g.event_id
      where g.user_id = auth.uid() and g.status = 'registered' and e.status = 'published' and e.ends_at > now()),
    private.researcher_has_verified_kyc(auth.uid())
  where auth.uid() is not null;
$$;

revoke all on function public.get_my_researcher_actions() from public, anon;
grant execute on function public.get_my_researcher_actions() to authenticated;
