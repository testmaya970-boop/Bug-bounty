-- Richer scope asset types, part 2: the canonicalization/matching logic for
-- ios_app/android_app/source_code/hardware/ai_model (202609030004 added the enum values
-- themselves -- a new enum value cannot be referenced in the same migration transaction
-- that adds it, so this is a separate file, not a separate design decision). See
-- docs/decisions/0060-richer-scope-asset-types.md.

-- ---------------------------------------------------------------------------
-- private.canonicalize_scope_target, redefined (not duplicated): one shared branch for
-- all five new types -- trim, collapse internal whitespace, cap length at 500 (matching
-- program_scope_entries.description's own ceiling elsewhere in this schema), reject
-- empty. No URL-shape or hostname validation is imposed -- unlike domain/url, a bundle
-- id ("com.example.app"), a bare App Store slug, or a hardware model string are all
-- legitimate real-world identifiers with no single common shape to validate against, so
-- this deliberately stays permissive rather than guessing a format and rejecting valid
-- input.
-- ---------------------------------------------------------------------------

create or replace function private.canonicalize_scope_target(p_asset_type public.program_asset_type, target_input text)
returns table (canonical text, display text, cidr_value cidr, url_origin text, url_path text)
language plpgsql stable set search_path = ''
as $$
declare
  raw text := trim(target_input);
  m text[];
  scheme_part text;
  host_part text;
  port_part text;
  path_part text;
  out_canonical text;
  out_display text;
  out_cidr cidr;
  out_origin text;
  out_path text;
begin
  if raw is null or char_length(raw) = 0 then
    raise exception 'INVALID_TARGET: Enter a target.' using errcode = '22023';
  end if;

  if p_asset_type = 'domain' then
    out_canonical := lower(raw);
    if right(out_canonical, 1) = '.' then out_canonical := left(out_canonical, -1); end if;
    if out_canonical ~ '[:/]' then
      raise exception 'INVALID_TARGET: Enter a bare hostname, e.g. api.example.com or *.example.com -- not a URL, port, or path.' using errcode = '22023';
    end if;
    if out_canonical !~ '^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception 'INVALID_TARGET: Enter a valid hostname, e.g. api.example.com or *.example.com.' using errcode = '22023';
    end if;
    out_display := out_canonical;

  elsif p_asset_type = 'url' then
    m := regexp_match(raw, '^(https?)://([a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?(/[^\s?#]*)?$', 'i');
    if m is null then
      raise exception 'INVALID_TARGET: Enter a valid http(s) URL without a query string or fragment, e.g. https://api.example.com/admin.' using errcode = '22023';
    end if;
    scheme_part := lower(m[1]);
    host_part := lower(m[2]);
    port_part := m[3];
    path_part := coalesce(m[4], '/');
    if path_part = '' then path_part := '/'; end if;
    if host_part !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception 'INVALID_TARGET: Enter a valid URL hostname.' using errcode = '22023';
    end if;
    if (scheme_part = 'http' and port_part = '80') or (scheme_part = 'https' and port_part = '443') then
      port_part := null;
    end if;
    out_origin := scheme_part || '://' || host_part || coalesce(':' || port_part, '');
    out_path := path_part;
    out_canonical := out_origin || out_path;
    out_display := out_canonical;

  elsif p_asset_type = 'ip_cidr' then
    begin
      out_cidr := raw::cidr;
    exception when others then
      raise exception 'INVALID_TARGET: Enter a valid IP address or CIDR range, e.g. 203.0.113.0/24 or 203.0.113.5.' using errcode = '22023';
    end;
    out_canonical := out_cidr::text;
    out_display := out_canonical;

  elsif p_asset_type in ('ios_app', 'android_app', 'source_code', 'hardware', 'ai_model') then
    -- One shared, permissive branch -- see this file's own header for why no
    -- format-specific validation is imposed here, unlike domain/url/ip_cidr.
    out_canonical := regexp_replace(raw, '\s+', ' ', 'g');
    if char_length(out_canonical) > 500 then
      raise exception 'INVALID_TARGET: Use 500 characters or fewer.' using errcode = '22023';
    end if;
    out_display := out_canonical;
  end if;

  canonical := out_canonical;
  display := out_display;
  cidr_value := out_cidr;
  url_origin := out_origin;
  url_path := out_path;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- private.match_program_scope, redefined (not duplicated): one shared branch for all
-- five new types -- exact canonical-string match only, no wildcard/prefix concept (see
-- this file's own header, decision 2). Identical precedence rule to every other branch:
-- an explicit out_of_scope entry is preferred as a tie-break -- irrelevant here since
-- exact match can only ever resolve to at most one active row per (program, asset_type,
-- canonical target) thanks to program_scope_entries' own unique index, but included for
-- structural consistency with the other branches rather than as a special case.
-- ---------------------------------------------------------------------------

create or replace function private.match_program_scope(
  target_program_id uuid,
  p_asset_type public.program_asset_type,
  canonical_target text,
  cidr_value cidr,
  p_url_origin text,
  p_url_path text
)
returns table (matched_entry_id uuid, matched_scope_state public.program_scope_state, matched_target text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  best_match record;
begin
  if p_asset_type = 'domain' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'domain' and e.status = 'active'
      and (
        e.target = canonical_target
        or (left(e.target, 2) = '*.' and canonical_target like ('%.' || substr(e.target, 3)))
      )
    order by (e.target = canonical_target) desc, char_length(e.target) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'ip_cidr' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'ip_cidr' and e.status = 'active'
      and e.target_cidr >>= cidr_value
    order by masklen(e.target_cidr) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type = 'url' then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = 'url' and e.status = 'active'
      and e.url_origin = p_url_origin
      and (
        e.url_path = p_url_path
        or p_url_path like (case when e.url_path = '/' then '/' else e.url_path || '/' end) || '%'
      )
    order by char_length(e.url_path) desc, (e.scope_state = 'out_of_scope') desc
    limit 1;

  elsif p_asset_type in ('ios_app', 'android_app', 'source_code', 'hardware', 'ai_model') then
    select e.id, e.target, e.scope_state into best_match
    from public.program_scope_entries e
    where e.program_id = target_program_id and e.asset_type = p_asset_type and e.status = 'active'
      and e.target = canonical_target
    order by (e.scope_state = 'out_of_scope') desc
    limit 1;
  end if;

  matched_entry_id := best_match.id;
  matched_scope_state := best_match.scope_state;
  matched_target := best_match.target;
  return next;
end;
$$;
