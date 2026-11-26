create table public.study_adaptive_plans (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  revision integer not null default 0 check(revision>=0),
  state jsonb not null check(jsonb_typeof(state)='object')
);
alter table public.study_adaptive_plans enable row level security;
revoke all on public.study_adaptive_plans from anon, authenticated;
grant select,insert,update on public.study_adaptive_plans to authenticated;
create policy adaptive_plan_owner on public.study_adaptive_plans for all to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());

create table public.study_historical_incidence (
  topic_id uuid not null references public.study_nodes(id),
  board text not null check(length(trim(board))>0),
  sample integer not null check(sample>0),
  occurrences integer not null check(occurrences between 0 and sample),
  source_url text not null check(source_url ~ '^https://[^/@[:space:]]+([/:?].*)?$'),
  verified_by uuid not null references auth.users(id) default auth.uid(),
  verified_at timestamptz not null default now(),
  primary key(topic_id,board)
);
alter table public.study_historical_incidence enable row level security;
revoke all on public.study_historical_incidence from anon, authenticated;
grant select,insert,update,delete on public.study_historical_incidence to authenticated;
create policy incidence_read on public.study_historical_incidence for select to authenticated using(public.study_read(topic_id));
create policy incidence_write on public.study_historical_incidence for all to authenticated
  using(public.study_catalog_admin() and public.study_edit(topic_id))
  with check(public.study_catalog_admin() and public.study_edit(topic_id) and verified_by=auth.uid());
