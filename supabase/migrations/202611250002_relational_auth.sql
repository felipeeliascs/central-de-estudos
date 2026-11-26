-- Additive migration: preserves study_nodes/materials/checks/notes and their IDs.
create function public.study_touch() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
   if (to_jsonb(new)->'id') is distinct from (to_jsonb(old)->'id') or (to_jsonb(new)->'owner_id') is distinct from (to_jsonb(old)->'owner_id') or (to_jsonb(new)->'user_id') is distinct from (to_jsonb(old)->'user_id') then raise exception 'Identidade imutável'; end if;
   new.created_at=old.created_at;
 end if;
 new.updated_at=now(); return new;
end; $$;
create table public.study_profiles(user_id uuid primary key references auth.users(id),display_name text not null default '' check(length(display_name)<=180),timezone text not null default 'America/Sao_Paulo');
create table public.study_roles(user_id uuid primary key references auth.users(id),role text not null check(role='admin'));
create table public.study_signup_allowlist(email text primary key check(email=lower(trim(email))),expires_at timestamptz not null,consumed_at timestamptz);
alter table public.study_profiles enable row level security;
alter table public.study_roles enable row level security;
alter table public.study_signup_allowlist enable row level security;
revoke all on public.study_profiles,public.study_roles,public.study_signup_allowlist from public,anon,authenticated;
grant select on public.study_profiles,public.study_roles to authenticated;
grant update(display_name,timezone) on public.study_profiles to authenticated;
create policy profile_self on public.study_profiles for select to authenticated using(user_id=auth.uid());
create policy profile_update on public.study_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy role_self on public.study_roles for select to authenticated using(user_id=auth.uid());
create function public.study_authorized_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.study_signup_allowlist set consumed_at=now() where email=lower(trim(new.email)) and expires_at>now() and consumed_at is null;
 if not found then raise exception 'Cadastro não autorizado'; end if;
 return new;
end; $$;
create trigger study_authorized_signup before insert on auth.users for each row execute function public.study_authorized_signup();
create function public.study_new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.study_profiles(user_id) values(new.id); return new; end; $$;
create trigger study_new_profile after insert on auth.users for each row execute function public.study_new_profile();
insert into public.study_profiles(user_id) select id from auth.users on conflict do nothing;
revoke all on function public.study_authorized_signup(),public.study_new_profile() from public,anon,authenticated;
create function public.study_content_read(content_owner uuid,topic uuid,visibility text,recipients uuid[]) returns boolean language sql stable set search_path='' as $$
select auth.uid() is not null and (topic is null or public.study_read(topic)) and (content_owner=auth.uid() or (visibility='shared' and auth.uid()=any(recipients)));
$$;
revoke all on function public.study_content_read(uuid,uuid,text,uuid[]) from public;
grant execute on function public.study_content_read(uuid,uuid,text,uuid[]) to authenticated;

create table public.study_contest_versions(id uuid primary key default gen_random_uuid(),contest_id uuid not null references public.study_nodes(id),version integer not null check(version>0),source_url text check(source_url is null or source_url like 'https://%'),published_on date,status text not null default 'draft' check(status in ('draft','published','superseded')),unique(contest_id,version));
alter table public.study_contest_versions enable row level security;
revoke all on public.study_contest_versions from public,anon,authenticated;
grant select,insert,update,delete on public.study_contest_versions to authenticated;
create policy versions_read on public.study_contest_versions for select to authenticated using(public.study_read(contest_id));create policy versions_write on public.study_contest_versions for all to authenticated using(public.study_edit(contest_id)) with check(public.study_edit(contest_id));

create table public.study_version_items(id uuid primary key default gen_random_uuid(),version_id uuid not null references public.study_contest_versions(id),node_id uuid not null references public.study_nodes(id),name text not null check(length(trim(name))>0),position integer not null check(position>=0),unique(version_id,node_id));
alter table public.study_version_items enable row level security;
revoke all on public.study_version_items from public,anon,authenticated;
grant select,insert,update,delete on public.study_version_items to authenticated;
create policy version_items_read on public.study_version_items for select to authenticated using(exists(select 1 from public.study_contest_versions v where v.id=version_id and public.study_read(v.contest_id)));create policy version_items_write on public.study_version_items for all to authenticated using(exists(select 1 from public.study_contest_versions v where v.id=version_id and public.study_edit(v.contest_id))) with check(exists(select 1 from public.study_contest_versions v where v.id=version_id and public.study_edit(v.contest_id) and public.study_root(node_id)=v.contest_id));

create table public.study_enrollments(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),contest_id uuid not null references public.study_nodes(id),status text not null default 'active' check(status in ('active','paused','archived')),unique(user_id,contest_id),unique(id,user_id));
alter table public.study_enrollments enable row level security;
revoke all on public.study_enrollments from public,anon,authenticated;
grant select,insert,update,delete on public.study_enrollments to authenticated;
create policy personal on public.study_enrollments for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (public.study_read(contest_id)));

create table public.study_bibliographies(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,visibility text not null default 'private' check(visibility in ('private','shared')),shared_with uuid[] not null default '{}',check(visibility='private' or cardinality(shared_with)>0),title text not null check(length(trim(title))>0),author text not null default '',edition text not null default '',url text check(url is null or url like 'https://%'),material_id uuid references public.study_materials(id));
alter table public.study_bibliographies enable row level security;
revoke all on public.study_bibliographies from public,anon,authenticated;
grant select,insert,update,delete on public.study_bibliographies to authenticated;
create policy content_read on public.study_bibliographies for select to authenticated using(public.study_content_read(owner_id,topic_id,visibility,shared_with));
create policy content_write on public.study_bibliographies for all to authenticated using(owner_id=auth.uid() and public.study_read(topic_id)) with check(owner_id=auth.uid() and public.study_read(topic_id));

create table public.study_progress(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,status text not null default 'not_started' check(status in ('not_started','studying','completed')),unique(user_id,topic_id),unique(id,user_id));
alter table public.study_progress enable row level security;
revoke all on public.study_progress from public,anon,authenticated;
grant select,insert,update,delete on public.study_progress to authenticated;
create policy personal on public.study_progress for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (public.study_read(topic_id)));

create table public.study_sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,started_at timestamptz not null,ended_at timestamptz,seconds integer not null default 0 check(seconds>=0),client_event_id uuid not null,unique(user_id,client_event_id),check(ended_at is null or ended_at>=started_at),unique(id,user_id));
alter table public.study_sessions enable row level security;
revoke all on public.study_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.study_sessions to authenticated;
create policy personal on public.study_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (public.study_read(topic_id)));

create table public.study_external_results(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,provider text not null default 'Gran Questões',source_url text check(source_url is null or source_url like 'https://%'),answered integer not null check(answered>=0),correct integer not null check(correct>=0 and correct<=answered),recorded_at timestamptz not null default now(),notes text not null default '',unique(id,user_id));
alter table public.study_external_results enable row level security;
revoke all on public.study_external_results from public,anon,authenticated;
grant select,insert,update,delete on public.study_external_results to authenticated;
create policy personal on public.study_external_results for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (public.study_read(topic_id)));

create table public.study_questions(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,visibility text not null default 'private' check(visibility in ('private','shared')),shared_with uuid[] not null default '{}',check(visibility='private' or cardinality(shared_with)>0),statement text not null check(length(trim(statement))>0),source text not null check(source in ('author','ai_generated','licensed')),reviewed boolean not null default false,explanation text not null default '',revision integer not null default 1 check(revision>0));
alter table public.study_questions enable row level security;
revoke all on public.study_questions from public,anon,authenticated;
grant select,insert,update,delete on public.study_questions to authenticated;
create policy content_read on public.study_questions for select to authenticated using(public.study_content_read(owner_id,topic_id,visibility,shared_with));
create policy content_write on public.study_questions for all to authenticated using(owner_id=auth.uid() and public.study_read(topic_id)) with check(owner_id=auth.uid() and public.study_read(topic_id));

create table public.study_question_options(id uuid primary key default gen_random_uuid(),question_id uuid not null references public.study_questions(id),label text not null,body text not null,correct boolean not null default false,unique(question_id,label));
alter table public.study_question_options enable row level security;
revoke all on public.study_question_options from public,anon,authenticated;
grant select,insert,update,delete on public.study_question_options to authenticated;
create policy options_read on public.study_question_options for select to authenticated using(exists(select 1 from public.study_questions q where q.id=question_id));create policy options_write on public.study_question_options for all to authenticated using(exists(select 1 from public.study_questions q where q.id=question_id and q.owner_id=auth.uid())) with check(exists(select 1 from public.study_questions q where q.id=question_id and q.owner_id=auth.uid()));

create table public.study_exams(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,visibility text not null default 'private' check(visibility in ('private','shared')),shared_with uuid[] not null default '{}',check(visibility='private' or cardinality(shared_with)>0),title text not null check(length(trim(title))>0),duration_minutes integer check(duration_minutes>0));
alter table public.study_exams enable row level security;
revoke all on public.study_exams from public,anon,authenticated;
grant select,insert,update,delete on public.study_exams to authenticated;
create policy content_read on public.study_exams for select to authenticated using(public.study_content_read(owner_id,topic_id,visibility,shared_with));
create policy content_write on public.study_exams for all to authenticated using(owner_id=auth.uid() and public.study_read(topic_id)) with check(owner_id=auth.uid() and public.study_read(topic_id));

create table public.study_exam_items(id uuid primary key default gen_random_uuid(),exam_id uuid not null references public.study_exams(id),question_id uuid not null references public.study_questions(id),position integer not null check(position>=0),weight numeric not null default 1 check(weight>0),unique(exam_id,position),unique(exam_id,question_id));
alter table public.study_exam_items enable row level security;
revoke all on public.study_exam_items from public,anon,authenticated;
grant select,insert,update,delete on public.study_exam_items to authenticated;
create policy exam_items_read on public.study_exam_items for select to authenticated using(exists(select 1 from public.study_exams e where e.id=exam_id));create policy exam_items_write on public.study_exam_items for all to authenticated using(exists(select 1 from public.study_exams e where e.id=exam_id and e.owner_id=auth.uid())) with check(exists(select 1 from public.study_exams e where e.id=exam_id and e.owner_id=auth.uid()) and exists(select 1 from public.study_questions q where q.id=question_id));

create table public.study_exam_attempts(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),exam_id uuid not null references public.study_exams(id),started_at timestamptz not null default now(),finished_at timestamptz,score numeric,check(finished_at is null or finished_at>=started_at),unique(id,user_id));
alter table public.study_exam_attempts enable row level security;
revoke all on public.study_exam_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.study_exam_attempts to authenticated;
create policy personal on public.study_exam_attempts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (exists(select 1 from public.study_exams e where e.id=exam_id)));

create table public.study_answers(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),attempt_id uuid not null,question_id uuid not null references public.study_questions(id),answer_snapshot jsonb not null check(jsonb_typeof(answer_snapshot)='object'),question_snapshot jsonb not null check(jsonb_typeof(question_snapshot)='object'),correct boolean not null,foreign key(attempt_id,user_id) references public.study_exam_attempts(id,user_id),unique(attempt_id,question_id),unique(id,user_id));
alter table public.study_answers enable row level security;
revoke all on public.study_answers from public,anon,authenticated;
grant select,insert,update,delete on public.study_answers to authenticated;
create policy personal on public.study_answers for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (exists(select 1 from public.study_questions q where q.id=question_id)));

create table public.study_errors(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,answer_id uuid,reason text not null,notes text not null default '',resolved boolean not null default false,foreign key(answer_id,user_id) references public.study_answers(id,user_id),unique(id,user_id));
alter table public.study_errors enable row level security;
revoke all on public.study_errors from public,anon,authenticated;
grant select,insert,update,delete on public.study_errors to authenticated;
create policy personal on public.study_errors for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (public.study_read(topic_id)));

create table public.study_decks(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,visibility text not null default 'private' check(visibility in ('private','shared')),shared_with uuid[] not null default '{}',check(visibility='private' or cardinality(shared_with)>0),title text not null check(length(trim(title))>0));
alter table public.study_decks enable row level security;
revoke all on public.study_decks from public,anon,authenticated;
grant select,insert,update,delete on public.study_decks to authenticated;
create policy content_read on public.study_decks for select to authenticated using(public.study_content_read(owner_id,topic_id,visibility,shared_with));
create policy content_write on public.study_decks for all to authenticated using(owner_id=auth.uid() and public.study_read(topic_id)) with check(owner_id=auth.uid() and public.study_read(topic_id));

create table public.study_cards(id uuid primary key default gen_random_uuid(),deck_id uuid not null references public.study_decks(id),front text not null check(length(trim(front))>0),back text not null check(length(trim(back))>0),source_material_id uuid references public.study_materials(id));
alter table public.study_cards enable row level security;
revoke all on public.study_cards from public,anon,authenticated;
grant select,insert,update,delete on public.study_cards to authenticated;
create policy cards_read on public.study_cards for select to authenticated using(exists(select 1 from public.study_decks d where d.id=deck_id));create policy cards_write on public.study_cards for all to authenticated using(exists(select 1 from public.study_decks d where d.id=deck_id and d.owner_id=auth.uid())) with check(exists(select 1 from public.study_decks d where d.id=deck_id and d.owner_id=auth.uid()));

create table public.study_fsrs_states(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),card_id uuid not null references public.study_cards(id),due timestamptz not null default now(),stability double precision not null default 0 check(stability>=0),difficulty double precision not null default 0 check(difficulty between 0 and 10),elapsed_days integer not null default 0 check(elapsed_days>=0),scheduled_days integer not null default 0 check(scheduled_days>=0),reps integer not null default 0 check(reps>=0),lapses integer not null default 0 check(lapses>=0),state smallint not null default 0 check(state between 0 and 3),last_review timestamptz,algorithm_version text not null check(length(trim(algorithm_version))>0),parameters jsonb not null default '{}' check(jsonb_typeof(parameters)='object'),unique(user_id,card_id),unique(id,user_id));
alter table public.study_fsrs_states enable row level security;
revoke all on public.study_fsrs_states from public,anon,authenticated;
grant select,insert,update,delete on public.study_fsrs_states to authenticated;
create policy personal on public.study_fsrs_states for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (exists(select 1 from public.study_cards c where c.id=card_id)));

create table public.study_review_logs(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),state_id uuid not null,card_id uuid not null references public.study_cards(id),rating smallint not null check(rating between 1 and 4),reviewed_at timestamptz not null default now(),before_state jsonb not null,after_state jsonb not null,client_event_id uuid not null,unique(user_id,client_event_id),foreign key(state_id,user_id) references public.study_fsrs_states(id,user_id),unique(id,user_id));
alter table public.study_review_logs enable row level security;
revoke all on public.study_review_logs from public,anon,authenticated;
grant select,insert,update,delete on public.study_review_logs to authenticated;
create policy personal on public.study_review_logs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (exists(select 1 from public.study_cards c where c.id=card_id)));

create table public.study_daily_plans(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),day date not null,timezone text not null default 'America/Sao_Paulo',available_minutes integer not null check(available_minutes>=0),unique(user_id,day),unique(id,user_id));
alter table public.study_daily_plans enable row level security;
revoke all on public.study_daily_plans from public,anon,authenticated;
grant select,insert,update,delete on public.study_daily_plans to authenticated;
create policy personal on public.study_daily_plans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (true));

create table public.study_plan_items(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,plan_id uuid not null,kind text not null check(kind in ('theory','questions','review','video')),minutes integer not null check(minutes>0),position integer not null check(position>=0),completed boolean not null default false,foreign key(plan_id,user_id) references public.study_daily_plans(id,user_id),unique(plan_id,position),unique(id,user_id));
alter table public.study_plan_items enable row level security;
revoke all on public.study_plan_items from public,anon,authenticated;
grant select,insert,update,delete on public.study_plan_items to authenticated;
create policy personal on public.study_plan_items for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (public.study_read(topic_id)));

create table public.study_prompts(id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),topic_id uuid not null references public.study_nodes(id) on delete restrict,visibility text not null default 'private' check(visibility in ('private','shared')),shared_with uuid[] not null default '{}',check(visibility='private' or cardinality(shared_with)>0),title text not null check(length(trim(title))>0),family text not null,body text not null check(length(trim(body))>0),contract_version text,revision integer not null default 1 check(revision>0));
alter table public.study_prompts enable row level security;
revoke all on public.study_prompts from public,anon,authenticated;
grant select,insert,update,delete on public.study_prompts to authenticated;
create policy content_read on public.study_prompts for select to authenticated using(public.study_content_read(owner_id,topic_id,visibility,shared_with));
create policy content_write on public.study_prompts for all to authenticated using(owner_id=auth.uid() and public.study_read(topic_id)) with check(owner_id=auth.uid() and public.study_read(topic_id));

create table public.study_imports(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),kind text not null,contract_version text not null,idempotency_key uuid not null,status text not null check(status in ('preview','applied','failed')),summary jsonb not null default '{}',unique(user_id,idempotency_key),unique(id,user_id));
alter table public.study_imports enable row level security;
revoke all on public.study_imports from public,anon,authenticated;
grant select,insert,update,delete on public.study_imports to authenticated;
create policy personal on public.study_imports for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (true));

-- All stable entities and existing records gain audit timestamps without resetting progress.
alter table public.study_nodes add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_nodes for each row execute function public.study_touch();
alter table public.study_materials add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_materials for each row execute function public.study_touch();
alter table public.study_members add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_members for each row execute function public.study_touch();
alter table public.study_checks add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_checks for each row execute function public.study_touch();
alter table public.study_notes add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_notes for each row execute function public.study_touch();
alter table public.study_profiles add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_profiles for each row execute function public.study_touch();
alter table public.study_roles add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_roles for each row execute function public.study_touch();
alter table public.study_signup_allowlist add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_signup_allowlist for each row execute function public.study_touch();
alter table public.study_contest_versions add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_contest_versions for each row execute function public.study_touch();
alter table public.study_version_items add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_version_items for each row execute function public.study_touch();
alter table public.study_enrollments add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_enrollments for each row execute function public.study_touch();
alter table public.study_bibliographies add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_bibliographies for each row execute function public.study_touch();
alter table public.study_progress add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_progress for each row execute function public.study_touch();
alter table public.study_sessions add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_sessions for each row execute function public.study_touch();
alter table public.study_external_results add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_external_results for each row execute function public.study_touch();
alter table public.study_questions add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_questions for each row execute function public.study_touch();
alter table public.study_question_options add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_question_options for each row execute function public.study_touch();
alter table public.study_exams add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_exams for each row execute function public.study_touch();
alter table public.study_exam_items add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_exam_items for each row execute function public.study_touch();
alter table public.study_exam_attempts add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_exam_attempts for each row execute function public.study_touch();
alter table public.study_answers add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_answers for each row execute function public.study_touch();
alter table public.study_errors add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_errors for each row execute function public.study_touch();
alter table public.study_decks add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_decks for each row execute function public.study_touch();
alter table public.study_cards add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_cards for each row execute function public.study_touch();
alter table public.study_fsrs_states add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_fsrs_states for each row execute function public.study_touch();
alter table public.study_review_logs add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_review_logs for each row execute function public.study_touch();
alter table public.study_daily_plans add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_daily_plans for each row execute function public.study_touch();
alter table public.study_plan_items add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_plan_items for each row execute function public.study_touch();
alter table public.study_prompts add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_prompts for each row execute function public.study_touch();
alter table public.study_imports add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
create trigger audit_touch before update on public.study_imports for each row execute function public.study_touch();
do $$ declare r record; begin for r in select t.relname as tbl,a.attname as col from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace cross join lateral unnest(c.conkey) k(attnum) join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum where c.contype='f' and n.nspname='public' and t.relname like 'study_%' loop execute format('create index if not exists %I on public.%I(%I)',r.tbl||'_'||r.col||'_fk',r.tbl,r.col); end loop; end $$;
create index study_fsrs_due on public.study_fsrs_states(user_id,due);
create index study_sessions_time on public.study_sessions(user_id,started_at);
create index study_reviews_time on public.study_review_logs(user_id,reviewed_at);
-- Review logs are append-only to preserve audit history.
drop policy personal on public.study_review_logs;
create policy review_read on public.study_review_logs for select to authenticated using(user_id=auth.uid());
create policy review_insert on public.study_review_logs for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.study_fsrs_states s where s.id=state_id and s.card_id=study_review_logs.card_id and s.user_id=auth.uid()));
create function public.study_contest_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.study_nodes where id=new.contest_id and kind='contest') then raise exception 'Concurso inválido'; end if; return new; end; $$;
create trigger contest_guard before insert or update on public.study_contest_versions for each row execute function public.study_contest_guard();
create trigger contest_guard before insert or update on public.study_enrollments for each row execute function public.study_contest_guard();
