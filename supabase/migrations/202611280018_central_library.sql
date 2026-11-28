-- Requires 001–015; works with or without the independent migration 016.
-- Additive migration: original UUIDs, files and study records stay intact.
alter table public.study_materials alter column topic_id drop not null;
alter table public.study_materials drop constraint study_materials_section_check;
alter table public.study_materials add constraint study_materials_section_check check(section in ('Videoaulas','Teoria e resumos','Bibliografia','Legislação','Mapas mentais','Questões externas','Flashcards','Anotações pessoais'));
alter table public.study_materials
  add column library_key text not null default '' check(library_key='' or library_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  add column author text not null default '' check(length(author)<=180),
  add column work text not null default '' check(length(work)<=180),
  add column edition text not null default '' check(length(edition)<=180),
  add column source text not null default '' check(length(source)<=2000),
  add column content_version text not null default '' check(length(content_version)<=80);
create unique index study_library_external_key on public.study_materials(owner_id,library_key) where library_key<>'';

create or replace function public.study_material_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' and (new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
    or new.topic_id is distinct from old.topic_id) then raise exception 'Identidade imutável'; end if;
  if new.topic_id is not null and not exists(select 1 from public.study_nodes where id=new.topic_id and kind in ('topic','subtopic')) then
    raise exception 'Selecione assunto ou subassunto'; end if;
  return new;
end; $$;
drop policy material_read on public.study_materials;
drop policy material_insert on public.study_materials;
drop policy material_update on public.study_materials;
drop policy material_delete on public.study_materials;
create policy material_read on public.study_materials for select to authenticated using(
  owner_id=auth.uid() or (visibility='shared' and auth.uid()=any(shared_with) and (topic_id is null or public.study_read(topic_id))));
create policy material_insert on public.study_materials for insert to authenticated with check(owner_id=auth.uid() and (topic_id is null or public.study_read(topic_id)));
create policy material_update on public.study_materials for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy material_delete on public.study_materials for delete to authenticated using(owner_id=auth.uid());

-- The original topic remains a compatibility anchor for catalog JSON and existing records.
-- Per-user links may add contexts or explicitly hide an original association.
create table public.study_material_links (
  user_id uuid not null references auth.users(id),
  material_id uuid not null references public.study_materials(id) on delete cascade,
  node_id uuid not null references public.study_nodes(id) on delete restrict,
  active boolean not null default true,
  primary key(user_id,material_id,node_id)
);
insert into public.study_material_links(user_id,material_id,node_id)
  select owner_id,id,topic_id from public.study_materials where topic_id is not null and not catalog_managed;
alter table public.study_material_links enable row level security;
revoke all on public.study_material_links from public,anon,authenticated;
grant select,insert,update on public.study_material_links to authenticated;
create policy library_link_read on public.study_material_links for select to authenticated using(user_id=auth.uid());
create policy library_link_write on public.study_material_links for insert to authenticated with check(
  user_id=auth.uid() and public.study_read(node_id) and exists(select 1 from public.study_materials m where m.id=material_id));
create policy library_link_update on public.study_material_links for update to authenticated using(user_id=auth.uid())
  with check(user_id=auth.uid() and (not active or (public.study_read(node_id) and exists(select 1 from public.study_materials m where m.id=material_id))));
create function public.study_link_library_material(material_id uuid,target uuid,linked boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if linked is null or auth.uid() is null then raise exception 'Vínculo inválido' using errcode='22023'; end if;
  if not linked and exists(select 1 from public.study_material_links l where l.user_id=auth.uid() and l.material_id=study_link_library_material.material_id and l.node_id=target) then
    update public.study_material_links l set active=false where l.user_id=auth.uid() and l.material_id=study_link_library_material.material_id and l.node_id=target;
    return;
  end if;
  if not public.study_read(target) or not exists(select 1 from public.study_materials m where m.id=material_id) then
    raise exception 'Sem acesso ao material ou conteúdo' using errcode='42501'; end if;
  insert into public.study_material_links(user_id,material_id,node_id,active) values(auth.uid(),material_id,target,linked)
    on conflict on constraint study_material_links_pkey do update set active=excluded.active;
end; $$;
alter table public.study_topic_equivalences
  add column coverage text not null default 'partial' check(coverage in ('full','partial')),
  add column review_notes text not null default '' check(length(review_notes)<=1000);
-- Existing equivalences require explicit review before they can transfer checklist steps.
create function public.study_review_equivalence(first_id uuid,second_id uuid,coverage text,review_notes text,confirmed boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coverage is null or coverage not in ('full','partial') or review_notes is null or length(trim(review_notes)) not between 1 and 1000 then
    raise exception 'Informe cobertura e comparação de profundidade/exigências dos editais' using errcode='22023'; end if;
  perform public.study_set_equivalence(first_id,second_id,confirmed);
  if confirmed then update public.study_topic_equivalences e set coverage=study_review_equivalence.coverage,
    review_notes=trim(study_review_equivalence.review_notes),confirmed_by=auth.uid(),confirmed_at=now()
    where e.first_topic=least(first_id,second_id) and e.second_topic=greatest(first_id,second_id); end if;
end; $$;
create function public.study_reuse_equivalent_progress(source_topic uuid,target_topic uuid,expected_checks jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare current_checks jsonb; changed integer;
begin
  if auth.uid() is null or not public.study_read(source_topic) or not public.study_read(target_topic)
    or not exists(select 1 from public.study_topic_equivalences e where e.first_topic=least(source_topic,target_topic)
      and e.second_topic=greatest(source_topic,target_topic) and e.coverage='full' and length(trim(e.review_notes))>0) then
    raise exception 'Reaproveitamento exige equivalência integral revisada e acesso aos dois assuntos' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':equivalent-progress',0));
  select coalesce(jsonb_agg(jsonb_build_object('step',c.step,'done',c.done) order by c.step),'[]'::jsonb)
    into current_checks from public.study_checks c where c.user_id=auth.uid() and c.topic_id=source_topic;
  if current_checks is distinct from expected_checks then raise exception 'Progresso alterado. Atualize antes de confirmar'; end if;
  insert into public.study_checks(user_id,topic_id,step,done)
    select auth.uid(),target_topic,c.step,true from public.study_checks c
    where c.user_id=auth.uid() and c.topic_id=source_topic and c.done
    on conflict(user_id,topic_id,step) do update set done=true where not study_checks.done;
  get diagnostics changed=row_count;
  return changed;
end; $$;
revoke all on function public.study_link_library_material(uuid,uuid,boolean),
  public.study_review_equivalence(uuid,uuid,text,text,boolean),
  public.study_reuse_equivalent_progress(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.study_link_library_material(uuid,uuid,boolean),
  public.study_review_equivalence(uuid,uuid,text,text,boolean),
  public.study_reuse_equivalent_progress(uuid,uuid,jsonb) to authenticated;

create function public.study_import_library_batch(operations jsonb,target uuid,request_id uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare op jsonb; entry jsonb; key text; material uuid; old public.study_materials;
  action text; done integer:=0; used_keys text[]:='{}'; receipt jsonb; batch_hash text;
begin
  if auth.uid() is null or request_id is null or operations is null or jsonb_typeof(operations)<>'array'
    or jsonb_array_length(operations) not between 1 and 300 or octet_length(operations::text)>524288 then
    raise exception 'Lote inválido: até 300 materiais e 512 KiB' using errcode='22023'; end if;
  if target is not null and not public.study_read(target) then raise exception 'Conteúdo sem acesso' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':library',0));
  batch_hash=md5(operations::text||coalesce(target::text,''));
  select summary into receipt from public.study_imports where user_id=auth.uid() and idempotency_key=request_id;
  if found then
    if receipt->>'hash' is distinct from batch_hash then raise exception 'Identificador utilizado por outro lote'; end if;
    return (receipt->>'materials')::integer;
  end if;
  for op in select * from jsonb_array_elements(operations) loop
    if jsonb_typeof(op)<>'object' or op-array['entry','action','existing_id','expected_updated_at']<>'{}'::jsonb
      or jsonb_typeof(op->'entry') is distinct from 'object' then raise exception 'Operação inválida'; end if;
    entry=op->'entry'; action=op->>'action';
    if action is null or action not in ('create','use','update') or entry-array['id','title','section','kind','body','back','url','author','work','edition','source','content_version']<>'{}'::jsonb then raise exception 'Campos desconhecidos ou ação inválida'; end if;
    for key in select jsonb_object_keys(entry) loop
      if jsonb_typeof(entry->key)<>'string' or length(entry->>key) > (case when key in ('body','back') then 100000 when key in ('url','source') then 2000 when key='content_version' then 80 else 180 end) then raise exception 'Campo deve ser texto dentro do limite: %',key; end if;
    end loop;
    if coalesce(entry->>'id','') !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or entry->>'id'=any(used_keys)
      or coalesce(length(trim(entry->>'title')),0) not between 1 and 180
      or coalesce(entry->>'kind','') not in ('text','link','youtube')
      or coalesce(entry->>'section','') not in ('Videoaulas','Teoria e resumos','Bibliografia','Legislação','Mapas mentais','Questões externas','Flashcards','Anotações pessoais')
      then raise exception 'ID repetido, seção, título ou formato inválido'; end if;
    used_keys=array_append(used_keys,entry->>'id');
    if (entry->>'kind'='text' and coalesce(length(trim(entry->>'body')),0)=0) or (entry->>'section'='Flashcards' and (coalesce(length(trim(entry->>'body')),0)=0 or coalesce(length(trim(entry->>'back')),0)=0)) then raise exception 'Conteúdo obrigatório ausente'; end if;
    if entry->>'kind' in ('link','youtube') and (coalesce(entry->>'url','') !~ '^https://[^/@[:space:]:?#]+(:[0-9]+)?([/?#][^[:space:]]*)?$'
      or length(entry->>'url')>2000) then raise exception 'Use URL HTTPS sem credenciais'; end if;
    if entry->>'kind'='youtube' and coalesce(entry->>'url','') !~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/' then raise exception 'Use URL válida do YouTube'; end if;
    -- PostgreSQL constraints revalidate body lengths, metadata and required flashcard sides.
    if action='create' then
      key=entry->>'id';
      if exists(select 1 from public.study_materials m where m.owner_id=auth.uid() and m.library_key=key) then
        key=left(key,42)||'-'||gen_random_uuid()::text;
      end if;
      insert into public.study_materials(owner_id,topic_id,library_key,title,section,kind,body,back,url,author,work,edition,source,content_version)
        values(auth.uid(),null,key,entry->>'title',entry->>'section',entry->>'kind',coalesce(entry->>'body',''),coalesce(entry->>'back',''),coalesce(entry->>'url',''),
          coalesce(entry->>'author',''),coalesce(entry->>'work',''),coalesce(entry->>'edition',''),coalesce(entry->>'source',''),coalesce(entry->>'content_version','')) returning id into material;
    else
      if action='update' then
        select * into old from public.study_materials m where m.id=(op->>'existing_id')::uuid for update;
      else
        select * into old from public.study_materials m where m.id=(op->>'existing_id')::uuid;
      end if;
      if not found then raise exception 'Material existente não encontrado ou sem acesso' using errcode='42501'; end if;
      if (op->>'expected_updated_at')::timestamptz is distinct from old.updated_at then raise exception 'Material alterado após a prévia. Atualize o acervo'; end if;
      material=old.id;
      if action='update' then
        if old.owner_id<>auth.uid() or old.catalog_managed then raise exception 'Sem permissão para atualizar este material' using errcode='42501'; end if;
        update public.study_materials set title=entry->>'title',section=entry->>'section',kind=entry->>'kind',
          body=coalesce(entry->>'body',''),back=coalesce(entry->>'back',''),url=coalesce(entry->>'url',''),
          author=coalesce(entry->>'author',''),work=coalesce(entry->>'work',''),edition=coalesce(entry->>'edition',''),
          source=coalesce(entry->>'source',''),content_version=coalesce(entry->>'content_version',''),
          file_path='',verified=false where id=material;
        -- File-backed updates require the individual form, avoiding orphaned Storage files.
        if old.file_path<>'' then raise exception 'Atualize arquivos pelo cadastro individual'; end if;
      end if;
    end if;
    if target is not null then perform public.study_link_library_material(material,target,true); end if;
    done=done+1;
  end loop;
  insert into public.study_imports(user_id,kind,contract_version,idempotency_key,status,summary)
    values(auth.uid(),'library:import','1.0',request_id,'applied',jsonb_build_object('materials',done,'hash',batch_hash));
  return done;
end; $$;
revoke all on function public.study_import_library_batch(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.study_import_library_batch(jsonb,uuid,uuid) to authenticated;

-- Preserve bibliographic metadata already present in the relational catalog.
update public.study_materials m set author=b.author,work=b.title,edition=coalesce(b.edition,''),source=coalesce(b.url,'')
  from public.study_bibliographies b where b.material_id=m.id;
create function public.study_sync_bibliography_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.material_id is not null then
    update public.study_materials set author=new.author,work=new.title,edition=coalesce(new.edition,''),source=coalesce(new.url,'')
      where id=new.material_id;
  end if;
  return new;
end; $$;
create trigger study_sync_bibliography_metadata after insert or update on public.study_bibliographies
for each row execute function public.study_sync_bibliography_metadata();
revoke all on function public.study_sync_bibliography_metadata() from public,anon,authenticated;

-- Include new library references in the deletion preflight, including links in other contests.
create or replace function public.study_contest_delete_blocked(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with nodes as (
  select id from public.study_nodes where id=target or public.study_root(id)=target
 ), managed as (
  select material_id,bibliography_id from public.study_catalog_resources where contest_id=target
 ), references_to_study as (
  select node_id as topic_id from public.study_material_links
  union all select topic_id from public.study_checks
  union all select topic_id from public.study_notes
  union all select topic_id from public.study_progress
  union all select topic_id from public.study_sessions
  union all select topic_id from public.study_external_results
  union all select topic_id from public.study_questions
  union all select topic_id from public.study_exams
  union all select topic_id from public.study_errors
  union all select topic_id from public.study_decks
  union all select topic_id from public.study_plan_items
  union all select topic_id from public.study_prompts
  union all select topic_id from public.study_historical_incidence
  union all select first_topic from public.study_topic_equivalences
  union all select second_topic from public.study_topic_equivalences
 )
 select exists(select 1 from references_to_study where topic_id in (select id from nodes))
 or exists(select 1 from public.study_material_links l where l.material_id in (select material_id from managed))
 or exists(select 1 from public.study_trails where contest_id=target)
 or exists(select 1 from public.study_materials where topic_id in (select id from nodes)
   and (not catalog_managed or id not in (select material_id from managed) or file_path<>''))
 or exists(select 1 from public.study_bibliographies where topic_id in (select id from nodes)
   and id not in (select bibliography_id from managed where bibliography_id is not null))
 -- Adaptive plans persist UUID references inside JSON rather than FKs. Be conservative.
 or exists(select 1 from public.study_adaptive_plans p cross join nodes n where strpos(lower(p.state::text),n.id::text)>0);
$$;

create function public.study_library_link_identity() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.user_id is distinct from old.user_id or new.material_id is distinct from old.material_id or new.node_id is distinct from old.node_id then
    raise exception 'Identidade do vínculo imutável'; end if;
  return new;
end; $$;
create trigger study_library_link_identity before update on public.study_material_links
for each row execute function public.study_library_link_identity();
revoke all on function public.study_library_link_identity() from public,anon,authenticated;
