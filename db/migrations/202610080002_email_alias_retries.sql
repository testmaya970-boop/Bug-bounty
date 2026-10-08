-- Mailgun retries a delivery that got a 5xx with the SAME token, for hours. 202610080001
-- treated any seen token as a replay, so a forward that failed temporarily (Mailgun send
-- API down, 503) was dropped on retry. Now only a finished outcome is a replay; a token
-- whose earlier attempt is still 'received' or ended 'failed' is retried on the same row.

create or replace function public.resolve_inbound_email_alias(p_provider_token text, p_local_part text, p_sender text, p_subject text)
returns table (forward_id uuid, outcome text, recipient_email text, recipient_display_name text)
language plpgsql security definer set search_path = ''
as $$
declare
  alias public.researcher_email_aliases;
  owner public.users;
  forward public.email_alias_forwards;
  local text := lower(trim(coalesce(p_local_part, '')));
  verdict text;
begin
  if nullif(trim(coalesce(p_provider_token, '')), '') is null then
    raise exception 'INVALID_INBOUND: missing provider token' using errcode = '22023';
  end if;

  select * into forward from public.email_alias_forwards f where f.provider_token = p_provider_token for update;
  if forward.id is not null and forward.status not in ('received', 'failed') then
    return query select null::uuid, 'replay'::text, null::text, null::text;
    return;
  end if;

  select * into alias from public.researcher_email_aliases a where a.local_part = local;
  if alias.user_id is not null then select * into owner from public.users u where u.id = alias.user_id; end if;

  verdict := case
    when alias.user_id is null then 'rejected_unknown_alias'
    when owner.is_suspended or owner.deactivated_at is not null or owner.account_type is distinct from 'researcher' then 'rejected_inactive'
    when (select count(*) from public.email_alias_forwards f
          where f.user_id = alias.user_id and f.status = 'forwarded' and f.received_at > now() - interval '24 hours') >= 200 then 'rate_limited'
    else 'received'
  end;

  if forward.id is not null then
    -- A retry of an attempt that never finished: same row, fresh verdict.
    update public.email_alias_forwards
       set status = verdict, error = null, completed_at = case when verdict = 'received' then null else now() end
     where id = forward.id
     returning * into forward;
  else
    insert into public.email_alias_forwards (user_id, local_part, provider_token, sender, subject, status, completed_at)
    values (alias.user_id, left(local, 64), p_provider_token, left(coalesce(p_sender, ''), 320), left(p_subject, 998), verdict,
            case when verdict = 'received' then null else now() end)
    returning * into forward;
  end if;

  return query select forward.id, verdict,
    case when verdict = 'received' then owner.email end,
    case when verdict = 'received' then owner.display_name end;
end;
$$;

revoke all on function public.resolve_inbound_email_alias(text, text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_inbound_email_alias(text, text, text, text) to service_role;
