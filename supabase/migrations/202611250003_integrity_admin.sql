-- Administrative authorization is resolved in the database, never user_metadata.
create or replace function public.study_touch() returns trigger language plpgsql set search_path='' as $$
declare key text;
begin
 foreach key in array array['id','owner_id','user_id','topic_id','contest_id','parent_id','version_id','node_id','deck_id','exam_id','question_id','attempt_id','answer_id','card_id','state_id','plan_id'] loop
 if (to_jsonb(new)->key) is distinct from (to_jsonb(old)->key) then raise exception 'Identidade ou vínculo imutável: %',key; end if;
 end loop;
 new.created_at=old.created_at;new.updated_at=now();return new;
end; $$;
alter table public.study_review_logs add constraint review_snapshots_objects check(jsonb_typeof(before_state)='object' and jsonb_typeof(after_state)='object');
create function public.study_authorize_email(address text,valid_until timestamptz) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.study_roles where user_id=auth.uid() and role='admin') then raise exception 'Sem permissão administrativa'; end if;
 if valid_until<=now() or valid_until>now()+interval '30 days' or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Autorização inválida'; end if;
 insert into public.study_signup_allowlist(email,expires_at) values(lower(trim(address)),valid_until) on conflict(email) do update set expires_at=excluded.expires_at,consumed_at=null;
end; $$;
revoke all on function public.study_authorize_email(text,timestamptz) from public,anon;
grant execute on function public.study_authorize_email(text,timestamptz) to authenticated;
create function public.study_topic_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.study_nodes where id=new.topic_id and kind in ('topic','subtopic')) then raise exception 'Assunto inválido'; end if; return new; end; $$;
do $$ declare name text; begin foreach name in array array['study_bibliographies','study_progress','study_sessions','study_external_results','study_questions','study_exams','study_errors','study_decks','study_plan_items','study_prompts'] loop execute format('create trigger topic_guard before insert or update on public.%I for each row execute function public.study_topic_guard()',name); end loop; end $$;
create function public.study_answer_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.study_exam_attempts a join public.study_exam_items i on i.exam_id=a.exam_id where a.id=new.attempt_id and a.user_id=new.user_id and i.question_id=new.question_id) then raise exception 'Questão não pertence à tentativa'; end if; return new; end; $$;
create trigger answer_guard before insert or update on public.study_answers for each row execute function public.study_answer_guard();
-- User-facing deletion of historical review logs was already prohibited in 002.
-- Prevent accidental mutation of historical answers: corrections use a new attempt.
drop policy personal on public.study_answers;
create policy answer_read on public.study_answers for select to authenticated using(user_id=auth.uid());
create policy answer_insert on public.study_answers for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.study_questions q where q.id=question_id));
