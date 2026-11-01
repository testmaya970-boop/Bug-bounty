-- Audit P1-3, second half: a payout handed to a provider (pending_provider) waits for its
-- signed webhook. If that webhook never arrives, the obligation sat in "processing" forever and
-- nothing surfaced it: the platform's recovery queue only listed failed attempts. Attempts
-- waiting on a provider for more than 24 hours now appear in the same queue, so a person
-- checks the provider's dashboard instead of the money silently stalling.
-- ponytail: surfaced for a human, not auto-reconciled; poll each provider's status API from the
-- worker once a live provider has real volume.

create or replace function public.list_needs_recovery_payment_attempts()
returns table (id uuid, payment_obligation_id uuid, organization_id uuid, organization_name text, program_id uuid, program_name text, report_id uuid, provider text, failure_code text, failure_message text, attempt_number integer, started_at timestamptz, completed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'FORBIDDEN: platform admin authority required' using errcode = '42501';
  end if;

  -- Deliberately never selects amount_minor_units/currency/researcher_id -- financial
  -- figures and researcher identity are outside this slice's narrow metadata boundary.
  return query
  select a.id, a.payment_obligation_id, ob.organization_id, o.name, ob.program_id, p.name, ob.report_id,
    a.provider,
    case when a.state = 'failed' then a.failure_code else 'STALE_PROVIDER' end,
    case when a.state = 'failed' then a.failure_message else 'No result from the payout provider for over 24 hours. Check the provider dashboard.' end,
    a.attempt_number, a.started_at, a.completed_at
  from public.payment_attempts a
  join public.payment_obligations ob on ob.id = a.payment_obligation_id
  join public.organizations o on o.id = ob.organization_id
  join public.programs p on p.id = ob.program_id
  where a.state = 'failed'
     or (a.state = 'pending_provider' and a.started_at < now() - interval '24 hours')
  order by a.completed_at desc nulls first, a.started_at desc;
end;
$$;
