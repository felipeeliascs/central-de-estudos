alter table public.study_sessions add column mode text not null default 'theory' check(mode in ('theory','video','reading','questions','review','mock'));
alter table public.study_historical_incidence add column period_start date, add column period_end date;
alter table public.study_historical_incidence add constraint incidence_period check(period_start is null or period_end is null or period_end>=period_start);
create function public.study_save_session(session_id uuid, topic_ref uuid, started timestamptz, ended timestamptz, seconds_value integer, study_mode text, event_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare existing uuid;
begin
 if auth.uid() is null or session_id is null or event_id is null or not public.study_read(topic_ref) then raise exception 'Sessão inválida'; end if;
 if seconds_value is null or seconds_value<=0 or ended<started or seconds_value>extract(epoch from (ended-started))+1 then raise exception 'Duração inválida'; end if;
 insert into public.study_sessions(id,user_id,topic_id,started_at,ended_at,seconds,client_event_id,mode) values(session_id,auth.uid(),topic_ref,started,ended,seconds_value,event_id,study_mode)
 on conflict(user_id,client_event_id) do nothing returning id into existing;
 if existing is null then select id into existing from public.study_sessions where user_id=auth.uid() and client_event_id=event_id; end if;
 return existing;
end; $$;
revoke all on function public.study_save_session(uuid,uuid,timestamptz,timestamptz,integer,text,uuid) from public,anon;
grant execute on function public.study_save_session(uuid,uuid,timestamptz,timestamptz,integer,text,uuid) to authenticated;
