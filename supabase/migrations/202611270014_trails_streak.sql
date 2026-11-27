-- Apply after 001–013, first in homologation with fictitious accounts.
create table public.study_trails(
 user_id uuid not null default auth.uid() references auth.users(id),
 contest_id uuid not null references public.study_nodes(id),
 revision integer not null check(revision>0),
 state jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,contest_id)
);
alter table public.study_trails enable row level security;
revoke all on public.study_trails from public,anon,authenticated;
grant select,insert,update on public.study_trails to authenticated;
create policy trail_owner on public.study_trails for all to authenticated
 using(user_id=auth.uid() and public.study_read(contest_id))
 with check(user_id=auth.uid() and public.study_read(contest_id));
create function public.study_trail_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg jsonb; entry jsonb; week jsonb; session jsonb; dep jsonb; total integer:=0;
begin
 if tg_op='UPDATE' and (new.user_id<>old.user_id or new.contest_id<>old.contest_id or new.revision<>old.revision+1) then raise exception 'Identidade imutável ou revisão inválida'; end if;
 if not exists(select 1 from public.study_nodes where id=new.contest_id and kind='contest') then raise exception 'Concurso inválido'; end if;
 if octet_length(new.state::text)>524288 or jsonb_typeof(new.state) is distinct from 'object' or new.state->>'version' is distinct from '1'
  or new.state-array['version','config','weeks']<>'{}'::jsonb or jsonb_typeof(new.state->'config') is distinct from 'object'
  or jsonb_typeof(new.state->'weeks') is distinct from 'array' then raise exception 'Trilha inválida'; end if;
 cfg=new.state->'config';
 if cfg-array['minutes','measure','topics']<>'{}'::jsonb or coalesce(cfg->>'measure','') not in ('exams','questions')
  or jsonb_typeof(cfg->'minutes') is distinct from 'array' or jsonb_array_length(cfg->'minutes')<>7
  or exists(select 1 from jsonb_array_elements(cfg->'minutes') x where jsonb_typeof(x)<>'number' or x::text !~ '^[0-9]+$' or (x::text)::integer>720)
  or jsonb_typeof(cfg->'topics') is distinct from 'array' or jsonb_array_length(cfg->'topics')>1500
  or jsonb_array_length(new.state->'weeks')>156 then raise exception 'Configuração inválida'; end if;
 for entry in select * from jsonb_array_elements(cfg->'topics') loop
  if jsonb_typeof(entry) is distinct from 'object' or entry-array['topic_id','requires','minutes','estimated_priority']<>'{}'::jsonb
   or coalesce(entry->>'minutes','') !~ '^[0-9]+$' or (entry->>'minutes')::integer not between 5 and 480
   or coalesce(entry->>'estimated_priority','') not in ('low','medium','high') or jsonb_typeof(entry->'requires') is distinct from 'array'
   or jsonb_array_length(entry->'requires')>100
   or not exists(select 1 from public.study_nodes where id=(entry->>'topic_id')::uuid and kind in ('topic','subtopic') and public.study_root(id)=new.contest_id)
   then raise exception 'Assunto ou pré-requisito inválido'; end if;
  for dep in select * from jsonb_array_elements(entry->'requires') loop
   if dep#>>'{}'=entry->>'topic_id' or not exists(select 1 from public.study_nodes where id=(dep#>>'{}')::uuid and kind in ('topic','subtopic') and public.study_root(id)=new.contest_id) then raise exception 'Pré-requisito inválido'; end if;
  end loop;
 end loop;
 if (select count(distinct x->>'topic_id') from jsonb_array_elements(cfg->'topics') x)<>jsonb_array_length(cfg->'topics') then raise exception 'Assunto duplicado'; end if;
 -- Deduplicated transitive closure bounds work to pairs of topics, not all paths.
 if exists(with recursive edges as (
  select x->>'topic_id' as child,d#>>'{}' as parent from jsonb_array_elements(cfg->'topics') x cross join lateral jsonb_array_elements(x->'requires') d
 ), paths as (
  select child,parent from edges
  union select p.child,e.parent from paths p join edges e on e.child=p.parent
 ) select 1 from paths where child=parent) then raise exception 'Ciclo de pré-requisitos'; end if;
 for week in select * from jsonb_array_elements(new.state->'weeks') loop
  if jsonb_typeof(week->'sessions') is distinct from 'array' or jsonb_array_length(week->'sessions')>2000 or jsonb_typeof(week->'warnings') is distinct from 'array'
   or coalesce(week->>'week','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Semana inválida'; end if;
  perform (week->>'week')::date;
  for session in select * from jsonb_array_elements(week->'sessions') loop
   total=total+1;
   if total>12000 or coalesce(length(session->>'id'),0) not between 1 and 180
    or coalesce(session->>'minutes','') !~ '^[0-9]+$' or (session->>'minutes')::integer not between 1 and 720
    or jsonb_typeof(session->'done') is distinct from 'boolean'
    or coalesce(session->>'day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or not exists(select 1 from public.study_nodes where id=(session->>'topic_id')::uuid and kind in ('topic','subtopic') and public.study_root(id)=new.contest_id)
    then raise exception 'Sessão da trilha inválida'; end if;
   if (session->>'day')::date<(week->>'week')::date or (session->>'day')::date>(week->>'week')::date+6 then raise exception 'Dia fora da semana'; end if;
   if session->'done'='true'::jsonb and (session->>'done_at' is null or (session->>'done_at')::timestamptz>now()+interval '5 minutes') then raise exception 'Conclusão futura inválida'; end if;
  end loop;
 end loop;
 new.updated_at=now(); return new;
end; $$;
create trigger trail_guard before insert or update on public.study_trails for each row execute function public.study_trail_guard();

create function public.study_activity_streak() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
 with days as (
  select (ended_at at time zone 'America/Sao_Paulo')::date as day from public.study_sessions where user_id=auth.uid() and seconds>0 and ended_at<=now()
  union select (recorded_at at time zone 'America/Sao_Paulo')::date from public.study_external_results where user_id=auth.uid() and answered>0 and recorded_at<=now()
  union select (created_at at time zone 'America/Sao_Paulo')::date from public.study_answers where user_id=auth.uid() and created_at<=now()
  union select (reviewed_at at time zone 'America/Sao_Paulo')::date from public.study_review_logs where user_id=auth.uid() and reviewed_at<=now()
 ), numbered as (select day,day-row_number() over(order by day)::integer as island from days),
 groups as (select count(*)::integer as days,max(day) as last from numbered group by island)
 select jsonb_build_object(
  'current',coalesce((select days from groups where last>=today-1 order by last desc limit 1),0),
  'best',coalesce((select max(days) from groups),0),
  'studied_today',exists(select 1 from days where day=today),
  'last_day',(select max(day) from days),
  'active_days',coalesce((select jsonb_agg(day order by day) from days where day>=today-6),'[]'::jsonb)
 ) into result;
 return result;
end; $$;
revoke all on function public.study_activity_streak() from public,anon;
grant execute on function public.study_activity_streak() to authenticated;
