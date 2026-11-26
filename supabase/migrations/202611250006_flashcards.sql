alter table public.study_decks add column author text not null default '', add column archived boolean not null default false;
alter table public.study_cards add column archived boolean not null default false,
  add column front_image text check(front_image is null or front_image ~ '^https://[^/@[:space:]]+([/:?].*)?$'),
  add column back_image text check(back_image is null or back_image ~ '^https://[^/@[:space:]]+([/:?].*)?$'),
  add column choices jsonb not null default '[]', add column correct_choice smallint,
  add column source_question_id uuid references public.study_questions(id),
  add column source_error_id uuid references public.study_errors(id);
alter table public.study_cards add constraint flashcard_choices check(jsonb_typeof(choices)='array' and ((choices='[]' and correct_choice is null) or (jsonb_array_length(choices) between 2 and 8 and correct_choice is not null and correct_choice between 0 and jsonb_array_length(choices)-1)));
create unique index flashcard_one_per_error_per_deck on public.study_cards(deck_id,source_error_id) where source_error_id is not null;
alter table public.study_fsrs_states add column learning_steps integer not null default 0 check(learning_steps>=0);
alter table public.study_review_logs add column scheduler_log jsonb;

create table public.study_flashcard_goals (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  daily_new integer not null default 10 check(daily_new between 0 and 500),
  daily_reviews integer not null default 50 check(daily_reviews between 0 and 2000)
);
alter table public.study_flashcard_goals enable row level security;
revoke all on public.study_flashcard_goals from public,anon,authenticated;
grant select,insert,update on public.study_flashcard_goals to authenticated;
create policy goals_self on public.study_flashcard_goals for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.flashcard_source_guard() returns trigger language plpgsql set search_path='' as $$
declare deck_visibility text;
begin
  if tg_op='UPDATE' and (new.source_error_id is distinct from old.source_error_id or new.source_question_id is distinct from old.source_question_id) then raise exception 'Origem do cartão é imutável'; end if;
  if new.source_error_id is null and new.source_question_id is null then return new; end if;
  select visibility into deck_visibility from public.study_decks where id=new.deck_id for update;
  if deck_visibility is distinct from 'private' or not exists(select 1 from public.study_errors e join public.study_answers a on a.id=e.answer_id where e.id=new.source_error_id and e.user_id=auth.uid() and a.question_id=new.source_question_id) then raise exception 'Origem inválida ou baralho compartilhado'; end if;
  return new;
end; $$;
create trigger flashcard_source_guard before insert or update on public.study_cards for each row execute function public.flashcard_source_guard();

create function public.flashcard_deck_sharing_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.visibility='shared' and exists(select 1 from public.study_cards c where c.deck_id=new.id and c.source_error_id is not null) then raise exception 'Baralhos com cartões do caderno de erros são privados'; end if;
 return new;
end; $$;
create trigger flashcard_deck_sharing_guard before update on public.study_decks for each row execute function public.flashcard_deck_sharing_guard();

create function public.study_convert_error(target_deck uuid,error_ref uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source record; result uuid; choices jsonb; answer_index integer;
begin
 if not exists(select 1 from public.study_decks d where d.id=target_deck and d.owner_id=auth.uid() and d.visibility='private' and not d.archived) then raise exception 'Selecione um baralho privado próprio'; end if;
 select a.question_id,q.statement,q.explanation into source from public.study_errors e join public.study_answers a on a.id=e.answer_id join public.study_questions q on q.id=a.question_id where e.id=error_ref and e.user_id=auth.uid();
 if not found then raise exception 'O erro não possui uma questão acessível'; end if;
 select jsonb_agg(o.body order by o.position),min(o.position) filter(where o.correct) into choices,answer_index from (select body,correct,row_number() over(order by label,id)-1 as position from public.study_question_options where question_id=source.question_id) o;
 if choices is null or jsonb_array_length(choices) not between 2 and 8 or answer_index is null or (select count(*) from public.study_question_options where question_id=source.question_id and correct)<>1 then choices='[]';answer_index=null; end if;
 insert into public.study_cards(deck_id,front,back,choices,correct_choice,source_question_id,source_error_id) values(target_deck,source.statement,coalesce(nullif(trim(source.explanation),''),case when answer_index is not null then choices->>answer_index else 'Consulte a questão original.' end),choices,answer_index,source.question_id,error_ref)
 on conflict(deck_id,source_error_id) where source_error_id is not null do nothing returning id into result;
 return coalesce(result,(select id from public.study_cards where deck_id=target_deck and source_error_id=error_ref));
end; $$;

create function public.study_import_flashcards(deck_ref uuid,topic_ref uuid,deck_title text,deck_author text,cards jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 if jsonb_typeof(cards) is distinct from 'array' or jsonb_array_length(cards)>500 or octet_length(cards::text)>2097152 then raise exception 'Lote de cartões inválido'; end if;
 if exists(select 1 from public.study_decks d where d.id=deck_ref and d.owner_id=auth.uid()) then return deck_ref; end if;
 insert into public.study_decks(id,topic_id,title,author) values(deck_ref,topic_ref,deck_title,deck_author);
 for item in select value from jsonb_array_elements(cards) loop
   insert into public.study_cards(deck_id,front,back,front_image,back_image,choices,correct_choice) values(deck_ref,item->>'front',item->>'back',item->>'front_image',item->>'back_image',coalesce(item->'choices','[]'),(item->>'correct_choice')::smallint);
 end loop;
 return deck_ref;
end; $$;

-- States and their event logs must advance together. The client computes FSRS and sends
-- the full transition, while PostgreSQL serializes it for the authenticated user/card.
revoke insert,update,delete on public.study_fsrs_states,public.study_review_logs from authenticated;
create function public.study_save_flashcard_review(card_ref uuid,event_ref uuid,expected_reps integer,grade smallint,review_time timestamptz,next_card jsonb,review_log jsonb,version text,settings jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); previous public.study_fsrs_states; remembered public.study_review_logs; target public.study_decks; saved_id uuid; log_id uuid;
begin
 if viewer is null or card_ref is null or event_ref is null or expected_reps is null then raise exception 'Avaliação inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(viewer::text||card_ref::text,0));
 select * into remembered from public.study_review_logs where user_id=viewer and client_event_id=event_ref;
 if found then
   if remembered.card_id<>card_ref or remembered.rating<>grade then raise exception 'Evento já utilizado'; end if;
   return remembered.id;
 end if;
 select d.* into target from public.study_cards c join public.study_decks d on d.id=c.deck_id where c.id=card_ref and not c.archived and not d.archived;
 if not found or not public.study_content_read(target.owner_id,target.topic_id,target.visibility,target.shared_with) then raise exception 'Cartão indisponível'; end if;
 select * into previous from public.study_fsrs_states where user_id=viewer and card_id=card_ref;
 if coalesce(previous.reps,0)<>expected_reps then raise exception 'O cartão foi revisado em outra sessão'; end if;
 if grade is null or grade not between 1 and 4 or review_time is null or review_time>now()+interval '5 minutes' or review_time<coalesce(previous.due,'-infinity')
    or (next_card->>'reps')::integer is distinct from expected_reps+1 or (next_card->>'last_review')::timestamptz is distinct from review_time or (next_card->>'due')::timestamptz<=review_time
    or jsonb_typeof(review_log) is distinct from 'object' or (review_log->>'rating')::smallint is distinct from grade or (review_log->>'review')::timestamptz is distinct from review_time then raise exception 'Transição de revisão inválida'; end if;
 insert into public.study_fsrs_states(user_id,card_id,due,stability,difficulty,elapsed_days,scheduled_days,learning_steps,reps,lapses,state,last_review,algorithm_version,parameters)
 values(viewer,card_ref,(next_card->>'due')::timestamptz,(next_card->>'stability')::double precision,(next_card->>'difficulty')::double precision,(next_card->>'elapsed_days')::integer,(next_card->>'scheduled_days')::integer,(next_card->>'learning_steps')::integer,(next_card->>'reps')::integer,(next_card->>'lapses')::integer,(next_card->>'state')::smallint,review_time,version,settings)
 on conflict(user_id,card_id) do update set due=excluded.due,stability=excluded.stability,difficulty=excluded.difficulty,elapsed_days=excluded.elapsed_days,scheduled_days=excluded.scheduled_days,learning_steps=excluded.learning_steps,reps=excluded.reps,lapses=excluded.lapses,state=excluded.state,last_review=excluded.last_review,algorithm_version=excluded.algorithm_version,parameters=excluded.parameters returning id into saved_id;
 insert into public.study_review_logs(user_id,state_id,card_id,rating,reviewed_at,before_state,after_state,client_event_id,scheduler_log)
 values(viewer,saved_id,card_ref,grade,review_time,case when previous.id is null then '{}'::jsonb else to_jsonb(previous) end,next_card,event_ref,review_log||jsonb_build_object('algorithm_version',version,'parameters',settings)) returning id into log_id;
 return log_id;
end; $$;

revoke all on function public.study_save_flashcard_review(uuid,uuid,integer,smallint,timestamptz,jsonb,jsonb,text,jsonb),public.study_convert_error(uuid,uuid),public.study_import_flashcards(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.study_save_flashcard_review(uuid,uuid,integer,smallint,timestamptz,jsonb,jsonb,text,jsonb),public.study_convert_error(uuid,uuid),public.study_import_flashcards(uuid,uuid,text,text,jsonb) to authenticated;
