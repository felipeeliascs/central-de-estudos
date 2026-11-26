-- Exposes a minimal account directory to authenticated catalog administrators.
-- Existing RLS policies for profiles, notes, progress and study history are unchanged.
create function public.study_admin_overview(search_text text default '')
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  query_text text := lower(trim(coalesce(search_text, '')));
begin
  if not public.study_catalog_admin() then
    raise exception 'Apenas administradores podem consultar as contas' using errcode = '42501';
  end if;
  if length(query_text) > 254 then
    raise exception 'A busca excede 254 caracteres' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'accounts', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'administrators', (select count(*) from public.study_roles where role = 'admin'),
    'pending', (select count(*) from public.study_signup_allowlist where consumed_at is null and expires_at > now()),
    'users', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.email nulls last, row_data.id)
      from (
        select u.id, u.email, coalesce(p.display_name, '') as display_name,
               coalesce(r.role, 'student') as role, u.email_confirmed_at is not null as confirmed
        from auth.users u
        left join public.study_profiles p on p.user_id = u.id
        left join public.study_roles r on r.user_id = u.id
        where strpos(lower(coalesce(u.email, '')), query_text) > 0
           or strpos(lower(coalesce(p.display_name, '')), query_text) > 0
           or query_text = ''
        order by u.email nulls last, u.id
        limit 50
      ) row_data
    ), '[]'::jsonb),
    'authorizations', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.expires_at desc, row_data.email)
      from (
        select email, expires_at, consumed_at is not null as used,
               consumed_at is null and expires_at > now() as active
        from public.study_signup_allowlist
        where query_text = '' or strpos(email, query_text) > 0
        order by expires_at desc, email
        limit 50
      ) row_data
    ), '[]'::jsonb)
  );
end;
$$;

-- Reuse the existing authorization path, but refuse invalid values and accounts
-- that already exist. Dates are calculated by PostgreSQL, independently of the browser clock.
create function public.study_admin_allow_signup(address text, valid_days integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  normalized text := lower(trim(coalesce(address, '')));
begin
  if not public.study_catalog_admin() then
    raise exception 'Apenas administradores podem autorizar cadastros' using errcode = '42501';
  end if;
  if valid_days is null or valid_days not between 1 and 30
     or length(normalized) > 254
     or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido e um prazo entre 1 e 30 dias' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = normalized) then
    raise exception 'Já existe uma conta com esse e-mail' using errcode = '23505';
  end if;
  perform public.study_authorize_email(normalized, now() + make_interval(days => valid_days));
end;
$$;

create function public.study_admin_revoke_signup(address text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.study_catalog_admin() then
    raise exception 'Apenas administradores podem revogar cadastros' using errcode = '42501';
  end if;
  update public.study_signup_allowlist
  set expires_at = now()
  where email = lower(trim(address))
    and consumed_at is null and expires_at > now();
  return found;
end;
$$;

revoke all on function public.study_admin_overview(text), public.study_admin_allow_signup(text, integer),
  public.study_admin_revoke_signup(text) from public, anon, authenticated;
grant execute on function public.study_admin_overview(text), public.study_admin_allow_signup(text, integer),
  public.study_admin_revoke_signup(text) to authenticated;
