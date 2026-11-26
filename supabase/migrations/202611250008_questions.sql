alter table public.study_questions add column board text not null default '', add column year integer check(year between 1900 and 2100),
 add column difficulty text not null default 'medium' check(difficulty in ('easy','medium','hard')),
 add column source_name text not null default '', add column source_url text check(source_url ~ '^https://[^/@[:space:]]+([/:?#].*)?$'),
 add column image_url text check(image_url ~ '^https://[^/@[:space:]]+([/:?#].*)?$');
alter table public.study_errors add column external_url text check(external_url ~ '^https://[^/@[:space:]]+([/:?#].*)?$'),
 add column image_url text check(image_url ~ '^https://[^/@[:space:]]+([/:?#].*)?$'),
 add column external_statement text, add column external_answer text;
alter table public.study_external_results add column result_kind text not null default 'practice' check(result_kind in ('practice','mock'));

create table public.study_attempt_runtime(
 id uuid primary key references public.study_exam_attempts(id),
 kind text not null check(kind in ('study','mock','diagnostic')),
 deadline timestamptz,
 snapshots jsonb not null,
 picks jsonb not null default '{}',
 flags jsonb not null default '{}',
 cursor integer not null default 0,
 correction jsonb
);
alter table public.study_attempt_runtime enable row level security;
revoke all on public.study_attempt_runtime from public,anon,authenticated;

create function public.study_question_bank() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg((to_jsonb(q)-'explanation'-'shared_with')||jsonb_build_object('playable',o.total between 2 and 8 and o.keys=1) order by q.created_at,q.id),'[]'::jsonb)
 from public.study_questions q cross join lateral(select count(*) total,count(*) filter(where correct) keys from public.study_question_options where question_id=q.id) o;
$$;

create function public.study_add_questions(batch jsonb, importing boolean default false) returns integer
language plpgsql security invoker set search_path='' as $$
declare q jsonb; ref uuid; added integer:=0; answer integer; options jsonb;
begin
 if auth.uid() is null or jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch) not between 1 and 30 or octet_length(batch::text)>300000 then raise exception 'Lote inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('question-bank:'||auth.uid()::text,0));
 for q in select value from jsonb_array_elements(batch) loop
   options=q->'options'; answer=(q->>'answer')::integer;
   if jsonb_typeof(options) is distinct from 'array' or jsonb_array_length(options) not between 2 and 8 or answer is null or answer not between 0 and jsonb_array_length(options)-1
   or length(trim(coalesce(q->>'statement',''))) not between 1 and 12000 or length(trim(coalesce(q->>'explanation',''))) not between 1 and 12000
   or exists(select 1 from jsonb_array_elements(options) e where jsonb_typeof(e)<>'string' or length(trim(e#>>'{}')) not between 1 and 1500)
   or (select count(distinct lower(trim(regexp_replace(v,'[[:space:]]+',' ','g')))) from jsonb_array_elements_text(options) v)<>jsonb_array_length(options)
   or length(coalesce(q->>'board',''))>150 or length(coalesce(q->>'source_name',''))>180
   or (q->>'source'='licensed' and (coalesce(trim(q->>'source_name'),'')='' or q->>'source_url' is null))
   or (importing and coalesce(q->>'source_url','') ~* '^https://([^/.:?#]+\.)*(qconcursos\.com(\.br)?|grancursosonline\.com\.br|granquestoes\.com\.br)([/:?#]|$)') then raise exception 'Questão inválida ou fonte externa restrita a links'; end if;
   if not exists(select 1 from public.study_questions old where lower(trim(regexp_replace(old.statement,'[[:space:]]+',' ','g')))=lower(trim(regexp_replace(q->>'statement','[[:space:]]+',' ','g')))) then
     insert into public.study_questions(topic_id,statement,source,reviewed,explanation,board,year,difficulty,source_name,source_url,image_url)
     values((q->>'topic_id')::uuid,trim(q->>'statement'),q->>'source',coalesce((q->>'reviewed')::boolean,false),q->>'explanation',coalesce(q->>'board',''),(q->>'year')::integer,q->>'difficulty',coalesce(q->>'source_name',''),q->>'source_url',q->>'image_url') returning id into ref;
     insert into public.study_question_options(question_id,label,body,correct) select ref,chr(64+n::integer),trim(value),n-1=answer from jsonb_array_elements_text(options) with ordinality as o(value,n);
     added=added+1;
   end if;
 end loop;
 return added;
end; $$;

create function public.study_attempt_view(attempt_ref uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'title',e.title,'kind',r.kind,'started_at',a.started_at,'finished_at',a.finished_at,'deadline',r.deadline,
 'items',(select jsonb_agg(value-'answer'-'explanation'-'source_url' order by n) from jsonb_array_elements(r.snapshots) with ordinality o(value,n)),
 'picks',r.picks,'flags',r.flags,'cursor',r.cursor,'score',a.score,'correction',case when a.finished_at is not null then r.correction end)
 from public.study_exam_attempts a join public.study_exams e on a.exam_id=e.id join public.study_attempt_runtime r on r.id=a.id where a.id=attempt_ref and a.user_id=auth.uid();
$$;
create function public.study_my_attempts() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(v.attempt order by a.started_at desc,a.id) filter(where v.attempt is not null),'[]'::jsonb)
 from public.study_exam_attempts a cross join lateral (select public.study_attempt_view(a.id) as attempt) v where a.user_id=auth.uid();
$$;

create function public.study_begin_attempt(attempt_ref uuid, label text, activity text, minutes integer, selection jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); exam_ref uuid; stamp timestamptz:=clock_timestamp(); q jsonb; entry jsonb; items jsonb:='[]'; amount integer; ids uuid[]:='{}'; ref uuid; first_topic uuid;
begin
 if viewer is null or attempt_ref is null then raise exception 'Sessão inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(attempt_ref::text,0));
 if public.study_attempt_view(attempt_ref) is not null then return public.study_attempt_view(attempt_ref); end if;
 if activity is null or activity not in ('study','mock','diagnostic') or length(trim(coalesce(label,''))) not between 1 and 180 or jsonb_typeof(selection) is distinct from 'array' then raise exception 'Simulado inválido'; end if;
 amount=jsonb_array_length(selection);
 if amount not between 1 and 100 or (activity='study' and amount<>1) or (activity<>'study' and (minutes is null or minutes not between 1 and 480)) then raise exception 'Quantidade ou duração inválida'; end if;
 for entry in select value from jsonb_array_elements(selection) loop
   ref=(entry->>'id')::uuid;
   if ref is null or ref=any(ids) or (entry->>'weight')::numeric is null or (entry->>'weight')::numeric not between 0.0001 and 10000 then raise exception 'Seleção ou peso inválido';end if;
   select jsonb_build_object('id',s.id,'topic_id',s.topic_id,'discipline_id',case when n.kind='topic' then n.parent_id else p.parent_id end,'statement',s.statement,'image_url',s.image_url,'weight',(entry->>'weight')::numeric,'revision',s.revision,'options',opts.options,'answer',opts.answer,'explanation',s.explanation,'source_url',s.source_url) into q
     from public.study_questions s join public.study_nodes n on n.id=s.topic_id left join public.study_nodes p on p.id=n.parent_id
     cross join lateral(select jsonb_agg(body order by idx) options,min(idx) filter(where correct) answer,count(*) filter(where correct) keys from (select body,correct,row_number() over(order by qo.label,qo.id)-1 idx from public.study_question_options qo where qo.question_id=s.id) choices) opts
     where s.id=ref and public.study_content_read(s.owner_id,s.topic_id,s.visibility,s.shared_with) and opts.keys=1 and jsonb_array_length(opts.options) between 2 and 8;
   if q is null then raise exception 'Uma questão ficou indisponível. Revise a distribuição';end if;
   first_topic=coalesce(first_topic,(q->>'topic_id')::uuid);ids=array_append(ids,ref);items=items||jsonb_build_array(q);
 end loop;
 insert into public.study_exams(owner_id,topic_id,title,duration_minutes) values(viewer,first_topic,label,case when activity<>'study' then minutes end) returning id into exam_ref;
 insert into public.study_exam_items(exam_id,question_id,position,weight) select exam_ref,(value->>'id')::uuid,n-1,(value->>'weight')::numeric from jsonb_array_elements(items) with ordinality o(value,n);
 insert into public.study_exam_attempts(id,user_id,exam_id,started_at) values(attempt_ref,viewer,exam_ref,stamp);
 insert into public.study_attempt_runtime(id,kind,deadline,snapshots) values(attempt_ref,activity,case when activity<>'study' then stamp+make_interval(mins=>minutes) end,items);
 return public.study_attempt_view(attempt_ref);
end; $$;

create function public.study_attempt_step(attempt_ref uuid, item_ref uuid, choice integer, marked boolean, next_cursor integer, finalize boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); r public.study_attempt_runtime; finished timestamptz; stamp timestamptz; item jsonb; picked integer; right_choice integer; is_correct boolean; answer_ref uuid; all_points numeric:=0; earned numeric:=0; graded jsonb:='[]'; expired boolean;
begin
 select a.finished_at into finished from public.study_exam_attempts a where a.id=attempt_ref and a.user_id=viewer for update;
 if not found then raise exception 'Tentativa indisponível'; end if;
 select * into strict r from public.study_attempt_runtime where id=attempt_ref;
 if finished is not null then return public.study_attempt_view(attempt_ref); end if;
 stamp=clock_timestamp(); expired=r.deadline is not null and stamp>=r.deadline;
 if not expired then
   if item_ref is not null then
     select value into item from jsonb_array_elements(r.snapshots) where value->>'id'=item_ref::text;
     if item is null or (choice is not null and choice not between 0 and jsonb_array_length(item->'options')-1) then raise exception 'Alternativa inválida';end if;
     if choice is not null then r.picks=jsonb_set(r.picks,array[item_ref::text],to_jsonb(choice));end if;
     if marked is not null then r.flags=jsonb_set(r.flags,array[item_ref::text],to_jsonb(marked));end if;
   end if;
   if next_cursor is not null and next_cursor between 0 and jsonb_array_length(r.snapshots)-1 then r.cursor=next_cursor; end if;
 end if;
 if coalesce(finalize,false) or expired or (r.kind='study' and choice is not null) then
   for item in select value from jsonb_array_elements(r.snapshots) loop
     picked=(r.picks->>(item->>'id'))::integer;right_choice=(item->>'answer')::integer;
     all_points=all_points+(item->>'weight')::numeric;is_correct=coalesce(picked=right_choice,false);
     if is_correct then earned=earned+(item->>'weight')::numeric;end if;
     graded=graded||jsonb_build_array(jsonb_build_object('id',item->>'id','item',item-'answer'-'explanation'-'source_url','answer',right_choice,'selected',picked,'correct',is_correct,'explanation',item->>'explanation','source_url',item->>'source_url'));
     if picked is not null then
       insert into public.study_answers(user_id,attempt_id,question_id,answer_snapshot,question_snapshot,correct) values(viewer,attempt_ref,(item->>'id')::uuid,jsonb_build_object('selected',picked),item,is_correct) returning id into answer_ref;
       if not is_correct then insert into public.study_errors(user_id,topic_id,answer_id,reason) values(viewer,(item->>'topic_id')::uuid,answer_ref,'A classificar'); end if;
     end if;
   end loop;
   r.correction=graded;
   update public.study_exam_attempts set finished_at=stamp,score=round(100*earned/all_points,2) where id=attempt_ref;
 end if;
 update public.study_attempt_runtime set picks=r.picks,flags=r.flags,cursor=r.cursor,correction=r.correction where id=attempt_ref;
 return public.study_attempt_view(attempt_ref);
end; $$;

-- Use the correction preserved at the time of the attempt for new flashcards.
-- Earlier errors with no complete snapshot still use the original question.
create or replace function public.flashcard_source_guard() returns trigger language plpgsql set search_path='' as $$
declare deck_visibility text;
begin
 if tg_op='UPDATE' and (new.source_error_id is distinct from old.source_error_id or new.source_question_id is distinct from old.source_question_id) then raise exception 'Origem do cartão é imutável'; end if;
 if new.source_error_id is null and new.source_question_id is null then return new; end if;
 select visibility into deck_visibility from public.study_decks where id=new.deck_id for update;
 if deck_visibility is distinct from 'private' or not exists(
   select 1 from public.study_errors e left join public.study_answers a on a.id=e.answer_id
   where e.id=new.source_error_id and e.user_id=auth.uid()
     and ((a.question_id=new.source_question_id) or (e.answer_id is null and e.external_statement is not null and new.source_question_id is null))
 ) then raise exception 'Origem inválida ou baralho compartilhado'; end if;
 return new;
end; $$;
create or replace function public.study_convert_error(target_deck uuid,error_ref uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source record; result uuid; choices jsonb; answer_index integer;
begin
 if not exists(select 1 from public.study_decks d where d.id=target_deck and d.owner_id=auth.uid() and d.visibility='private' and not d.archived) then raise exception 'Selecione um baralho privado próprio'; end if;
 select a.question_id,a.question_snapshot,coalesce(a.question_snapshot->>'statement',q.statement,e.external_statement) statement,
   coalesce(a.question_snapshot->>'explanation',q.explanation,e.external_answer) explanation,coalesce(e.image_url,a.question_snapshot->>'image_url',q.image_url) image_url
 into source from public.study_errors e left join public.study_answers a on a.id=e.answer_id left join public.study_questions q on q.id=a.question_id
 where e.id=error_ref and e.user_id=auth.uid();
 if not found or source.statement is null then raise exception 'O erro não possui uma questão acessível'; end if;
 if jsonb_typeof(source.question_snapshot->'options')='array' and source.question_snapshot ? 'answer' then
   choices=source.question_snapshot->'options'; answer_index=(source.question_snapshot->>'answer')::integer;
 else
   select jsonb_agg(o.body order by o.position),min(o.position) filter(where o.correct) into choices,answer_index from (select body,correct,row_number() over(order by label,id)-1 as position from public.study_question_options where question_id=source.question_id) o;
   if (select count(*) from public.study_question_options where question_id=source.question_id and correct)<>1 then choices=null;end if;
 end if;
 if choices is null or jsonb_array_length(choices) not between 2 and 8 or answer_index is null or answer_index not between 0 and jsonb_array_length(choices)-1 then choices='[]';answer_index=null;end if;
 insert into public.study_cards(deck_id,front,back,front_image,choices,correct_choice,source_question_id,source_error_id)
 values(target_deck,source.statement,coalesce(nullif(trim(source.explanation),''),case when answer_index is not null then choices->>answer_index else 'Consulte a questão original.' end),source.image_url,choices,answer_index,source.question_id,error_ref)
 on conflict(deck_id,source_error_id) where source_error_id is not null do nothing returning id into result;
 return coalesce(result,(select id from public.study_cards where deck_id=target_deck and source_error_id=error_ref));
end; $$;

revoke insert,update,delete on public.study_exam_attempts,public.study_answers from authenticated;
revoke all on function public.study_question_bank(),public.study_add_questions(jsonb,boolean),public.study_attempt_view(uuid),public.study_my_attempts(),public.study_begin_attempt(uuid,text,text,integer,jsonb),public.study_attempt_step(uuid,uuid,integer,boolean,integer,boolean) from public,anon;
grant execute on function public.study_question_bank(),public.study_add_questions(jsonb,boolean),public.study_attempt_view(uuid),public.study_my_attempts(),public.study_begin_attempt(uuid,text,text,integer,jsonb),public.study_attempt_step(uuid,uuid,integer,boolean,integer,boolean) to authenticated;
