-- Who owns an engagement inside the organization: its business unit (a fixed category so
-- reports can be grouped), a product owner (an active member) and a security contact email.
-- The Launch Program Studio collected these but nothing stored them.
alter table public.programs
  add column business_unit text check (business_unit in (
    'engineering', 'product', 'security', 'it_infrastructure', 'cloud_platform', 'payments_finance',
    'mobile', 'data_ai', 'customer_facing_web', 'corporate', 'other')),
  add column product_owner_id uuid references public.users(id) on delete set null,
  add column security_contact text check (security_contact is null or (char_length(security_contact) <= 254 and security_contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

create or replace function public.update_program_ownership(
  target_program_id uuid,
  p_business_unit text,
  p_product_owner_id uuid,
  p_security_contact text
)
returns public.programs
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  program public.programs;
  contact text := nullif(lower(trim(coalesce(p_security_contact, ''))), '');
  updated public.programs;
begin
  program := private.lock_and_authorize_program_for_lifecycle(target_program_id);

  if p_product_owner_id is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = program.organization_id and m.user_id = p_product_owner_id and m.status = 'active'
  ) then
    raise exception 'INVALID_PRODUCT_OWNER: the product owner must be an active member of this organization' using errcode = '22023';
  end if;

  update public.programs
    set business_unit = nullif(p_business_unit, ''), product_owner_id = p_product_owner_id, security_contact = contact, updated_at = now()
    where id = target_program_id returning * into updated;

  insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata)
  values (actor, program.organization_id, 'program.ownership_updated', 'program', target_program_id,
    jsonb_build_object('business_unit', updated.business_unit, 'product_owner_id', updated.product_owner_id));

  return updated;
end;
$$;
revoke all on function public.update_program_ownership(uuid, text, uuid, text) from public, anon;
grant execute on function public.update_program_ownership(uuid, text, uuid, text) to authenticated;
