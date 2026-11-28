-- Independent of incidence-import migration 016; requires 001–015.
-- No publication, payment call, account enrollment or production credential is performed.
create function public.study_admin_catalog_availability() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.study_catalog_admin() then
    raise exception 'Apenas administradores podem gerenciar a disponibilidade' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',n.id,'name',n.name,'managed',c.contest_id is not null,
      'listed',coalesce(c.document->'listed'='true'::jsonb,false),
      'archived',n.catalog_archived,
      'items',(select count(*) from public.study_nodes i where i.id<>n.id and public.study_root(i.id)=n.id)
    ) order by n.name,n.id)
    from public.study_nodes n left join public.study_catalog c on c.contest_id=n.id
    where n.kind='contest' and public.study_edit(n.id)
  ),'[]'::jsonb);
end; $$;

create function public.study_admin_set_catalog_visibility(
  target uuid, expected_document jsonb, make_available boolean, request_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_doc jsonb; result uuid;
begin
  if not public.study_catalog_admin() or not public.study_edit(target) then
    raise exception 'Apenas administradores com edição podem alterar a disponibilidade' using errcode='42501';
  end if;
  if make_available is null or request_id is null or expected_document is null then
    raise exception 'Gere a prévia antes de confirmar' using errcode='22023';
  end if;
  current_doc=public.study_catalog_document(target);
  if make_available and coalesce((current_doc->>'archived')::boolean,false) then
    raise exception 'Reative o concurso no editor antes de disponibilizar' using errcode='22023';
  end if;
  -- study_apply_catalog locks the same catalog/root and compares the entire snapshot.
  -- Manual contests are adopted with existing IDs; private materials are never copied.
  result=public.study_apply_catalog(current_doc||jsonb_build_object('listed',make_available),
    expected_document,target,request_id,'manual');
  update public.study_imports set summary=summary||jsonb_build_object('listed',make_available)
    where user_id=auth.uid() and idempotency_key=request_id;
  return result;
end; $$;

-- Existing selections retain read access when a contest is withdrawn from discovery.
-- Discovery never enrolls anyone and never grants editing or access to private study.
create or replace function public.study_read(node_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.study_nodes n where n.id=public.study_root(node_id) and (
    n.owner_id=auth.uid()
    or exists(select 1 from public.study_members m where m.contest_id=n.id and m.user_id=auth.uid())
    or (auth.uid() is not null and exists(select 1 from public.study_catalog c where c.contest_id=n.id and (
      (c.document->'listed'='true'::jsonb and not n.catalog_archived)
      or exists(select 1 from public.study_enrollments e where e.contest_id=n.id and e.user_id=auth.uid())
    )))
  ));
$$;

-- Future backend storage. Authenticated clients, including admins, cannot write it.
create table public.study_billing_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'mercadopago' check(provider='mercadopago'),
  external_subscription_id text not null unique check(length(external_subscription_id) between 1 and 180),
  plan_name text not null check(length(trim(plan_name)) between 1 and 80),
  status text not null check(status in ('pending','authorized','paused','cancelled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create table public.study_billing_events (
  event_id text primary key check(length(event_id) between 1 and 180),
  provider text not null default 'mercadopago' check(provider='mercadopago'),
  status text not null default 'pending' check(status in ('pending','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.study_billing_subscriptions enable row level security;
alter table public.study_billing_events enable row level security;
revoke all on public.study_billing_subscriptions,public.study_billing_events from public,anon,authenticated;
-- Supabase service_role exists in hosted projects; the disposable SQL harness need not have it.
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant select,insert,update,delete on public.study_billing_subscriptions,public.study_billing_events to service_role;
  end if;
end; $$;

create function public.study_my_billing_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta' using errcode='42501'; end if;
  -- Charging remains disabled even if a future/test subscription row is present.
  return jsonb_build_object('access','free','charging_enabled',false,'integration','not_configured',
    'subscription',(select jsonb_build_object('plan_name',s.plan_name,'status',s.status,
      'current_period_end',s.current_period_end) from public.study_billing_subscriptions s where s.user_id=auth.uid()));
end; $$;

create function public.study_admin_billing_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.study_catalog_admin() then
    raise exception 'Apenas administradores podem consultar a integração' using errcode='42501';
  end if;
  return jsonb_build_object('access','free','charging_enabled',false,'integration','not_configured',
    'subscriptions',(select count(*) from public.study_billing_subscriptions),
    'pending_events',(select count(*) from public.study_billing_events where status='pending'));
end; $$;

revoke all on function public.study_admin_catalog_availability(),
  public.study_admin_set_catalog_visibility(uuid,jsonb,boolean,uuid),
  public.study_my_billing_summary(),public.study_admin_billing_overview() from public,anon,authenticated;
grant execute on function public.study_admin_catalog_availability(),
  public.study_admin_set_catalog_visibility(uuid,jsonb,boolean,uuid),
  public.study_my_billing_summary(),public.study_admin_billing_overview() to authenticated;
