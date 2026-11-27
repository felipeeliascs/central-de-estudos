-- Review and rehearse in a disposable test database before production.
-- No data is deleted. Existing incidence rows remain unclassified.
revoke delete on public.study_nodes from authenticated;

alter table public.study_historical_incidence add column measure text
  check(measure in ('exams','questions'));
create function public.study_incidence_evidence_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.measure is null or new.period_start is null or new.period_end is null then
    raise exception 'Informe unidade, período e amostra documentados';
  end if;
  if not exists(select 1 from public.study_nodes where id=new.topic_id and kind in ('topic','subtopic')) then
    raise exception 'Assunto inválido';
  end if;
  return new;
end; $$;
create trigger incidence_evidence_guard before insert or update on public.study_historical_incidence
  for each row execute function public.study_incidence_evidence_guard();

create function public.study_video_identity(value text) returns text
language sql immutable set search_path='' as $$
  select coalesce(
    substring(value from '^https://(?:www\.)?youtu\.be/([A-Za-z0-9_-]{11})(?:[?&#].*)?$'),
    substring(value from '^https://(?:www\.|m\.)?(?:youtube\.com|youtube-nocookie\.com)/(?:embed|shorts|live)/([A-Za-z0-9_-]{11})(?:[?&#].*)?$'),
    substring(value from '^https://(?:www\.|m\.)?youtube\.com/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$')
  );
$$;
revoke all on function public.study_video_identity(text) from public,anon;
grant execute on function public.study_video_identity(text) to authenticated;

create function public.study_apply_video_batch(batch jsonb, expected jsonb, target uuid, request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  current_doc jsonb; combined jsonb; entry jsonb; prior jsonb; duplicate jsonb;
  item jsonb; parent_item jsonb; video text; seen text[]:='{}'; key text;
begin
  if not public.study_catalog_admin() or target is null or not public.study_edit(target) then
    raise exception 'Sem permissão administrativa para o edital';
  end if;
  if batch is null or jsonb_typeof(batch) is distinct from 'object' or octet_length(batch::text)>1048576
    or batch - array['schema_version','type','contest_id','resources'] <> '{}'::jsonb
    or jsonb_typeof(batch->'schema_version') is distinct from 'string'
    or jsonb_typeof(batch->'contest_id') is distinct from 'string'
    or batch->>'schema_version' is distinct from '1.0' or batch->>'type' is distinct from 'video_batch'
    or jsonb_typeof(batch->'resources') is distinct from 'array' or request_id is null then
    raise exception 'Lote inválido';
  end if;
  if jsonb_array_length(batch->'resources') not between 1 and 2000 then raise exception 'Tamanho do lote inválido'; end if;
  -- Same transaction lock as full imports; a stale preview cannot overwrite a retification.
  perform pg_advisory_xact_lock(hashtextextended(batch->>'contest_id',0));
  current_doc=public.study_catalog_document(target);
  if not exists(select 1 from public.study_catalog where contest_id=target)
    or batch->>'contest_id' is distinct from current_doc->>'id' then raise exception 'ID do edital inválido'; end if;
  if current_doc is distinct from expected then raise exception 'A prévia está desatualizada. Gere novamente'; end if;
  if current_doc->'archived'='true'::jsonb then raise exception 'Reative o edital antes de importar'; end if;
  combined=current_doc->'resources';
  for entry in select * from jsonb_array_elements(batch->'resources') loop
    if jsonb_typeof(entry) is distinct from 'object'
      or entry - array['id','item','kind','title','url','author','edition','text','sources'] <> '{}'::jsonb
      or entry->>'kind' is distinct from 'video'
      or coalesce(entry->>'id','') !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
      or coalesce(entry->>'item','') !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
      or entry->>'id'=any(seen) then raise exception 'Videoaula inválida ou ID repetido'; end if;
    seen=array_append(seen,entry->>'id');
    foreach key in array array['id','item','title','url','author','edition','text'] loop
      if entry ? key and (jsonb_typeof(entry->key)<>'string' or length(trim(entry->>key))<1
        or length(entry->>key)>case key when 'text' then 100000 when 'url' then 2000 else 180 end) then
        raise exception 'Campo inválido: %',key;
      end if;
    end loop;
    if not entry ? 'title' then raise exception 'Título obrigatório'; end if;
    perform public.study_catalog_metadata(entry);
    video=public.study_video_identity(entry->>'url');
    if video is null then raise exception 'URL de vídeo do YouTube inválida'; end if;
    select value into item from jsonb_array_elements(current_doc->'items') where value->>'id'=entry->>'item';
    if item is null or item->>'kind' not in ('topic','subtopic') or item->'archived'='true'::jsonb then
      raise exception 'Referência inválida ou arquivada: %',entry->>'item';
    end if;
    parent_item=item;
    while parent_item->>'parent' is not null loop
      select value into parent_item from jsonb_array_elements(current_doc->'items') where value->>'id'=parent_item->>'parent';
      if parent_item->'archived'='true'::jsonb then raise exception 'Referência arquivada'; end if;
    end loop;
    select value into prior from jsonb_array_elements(combined) where value->>'id'=entry->>'id';
    if prior is not null and (prior->>'kind'<>'video' or prior->>'item'<>entry->>'item'
      or public.study_video_identity(prior->>'url') is distinct from video) then
      raise exception 'ID existente possui outro vínculo ou vídeo';
    end if;
    select value into duplicate from jsonb_array_elements(combined) where value->>'kind'='video'
      and value->>'item'=entry->>'item' and public.study_video_identity(value->>'url')=video limit 1;
    if duplicate->'archived'='true'::jsonb then raise exception 'Aula arquivada; revise no catálogo'; end if;
    if duplicate is null then combined=combined||jsonb_build_array(entry); end if;
  end loop;
  return public.study_apply_catalog(jsonb_set(current_doc,'{resources}',combined),current_doc,target,request_id,'import');
end; $$;
revoke all on function public.study_apply_video_batch(jsonb,jsonb,uuid,uuid) from public,anon;
grant execute on function public.study_apply_video_batch(jsonb,jsonb,uuid,uuid) to authenticated;
