alter table public.study_nodes add column catalog_key text, add column catalog_archived boolean not null default false;
alter table public.study_materials add column catalog_managed boolean not null default false, add column catalog_archived boolean not null default false;
alter table public.study_contest_versions add column catalog_snapshot jsonb;

create table public.study_catalog (
  contest_id uuid primary key references public.study_nodes(id),
  external_id text not null unique,
  document jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.study_catalog_resources (
  contest_id uuid not null references public.study_catalog(contest_id),
  external_id text not null,
  material_id uuid not null unique references public.study_materials(id),
  bibliography_id uuid unique references public.study_bibliographies(id),
  primary key(contest_id,external_id)
);
create table public.study_topic_equivalences (
  first_topic uuid not null references public.study_nodes(id),
  second_topic uuid not null references public.study_nodes(id),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  primary key(first_topic,second_topic), check(first_topic<second_topic)
);
create index on public.study_topic_equivalences(second_topic);
alter table public.study_catalog enable row level security;
alter table public.study_catalog_resources enable row level security;
alter table public.study_topic_equivalences enable row level security;
revoke all on public.study_catalog,public.study_catalog_resources,public.study_topic_equivalences from public,anon,authenticated;
grant select on public.study_catalog,public.study_topic_equivalences to authenticated;

create or replace function public.study_read(node_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.study_nodes n where n.id=public.study_root(node_id) and (
    n.owner_id=auth.uid() or exists(select 1 from public.study_members m where m.contest_id=n.id and m.user_id=auth.uid())
    or (auth.uid() is not null and exists(select 1 from public.study_catalog c where c.contest_id=n.id and c.document->'listed'='true'::jsonb and (not n.catalog_archived or exists(select 1 from public.study_enrollments e where e.contest_id=n.id and e.user_id=auth.uid()))))
  ));
$$;
create policy catalog_read on public.study_catalog for select to authenticated using(public.study_read(contest_id));
create policy equivalence_read on public.study_topic_equivalences for select to authenticated using(public.study_read(first_topic) and public.study_read(second_topic));
create policy catalog_material_read on public.study_materials for select to authenticated using(catalog_managed and public.study_read(topic_id));
create policy catalog_material_insert on public.study_materials as restrictive for insert to authenticated with check(not catalog_managed and not catalog_archived);
create policy catalog_material_update on public.study_materials as restrictive for update to authenticated using(not catalog_managed) with check(not catalog_managed and not catalog_archived);
create policy catalog_material_delete on public.study_materials as restrictive for delete to authenticated using(not catalog_managed);
create policy catalog_bibliography_read on public.study_bibliographies for select to authenticated using(exists(select 1 from public.study_materials m where m.id=material_id and m.catalog_managed));
create policy catalog_bibliography_update on public.study_bibliographies as restrictive for update to authenticated using(not exists(select 1 from public.study_materials m where m.id=material_id and m.catalog_managed)) with check(not exists(select 1 from public.study_materials m where m.id=material_id and m.catalog_managed));
create policy catalog_bibliography_delete on public.study_bibliographies as restrictive for delete to authenticated using(not exists(select 1 from public.study_materials m where m.id=material_id and m.catalog_managed));
create policy catalog_node_insert on public.study_nodes as restrictive for insert to authenticated with check(catalog_key is null and not catalog_archived and (parent_id is null or not exists(select 1 from public.study_catalog where contest_id=public.study_root(parent_id))));
create policy catalog_node_update on public.study_nodes as restrictive for update to authenticated using(catalog_key is null and not exists(select 1 from public.study_catalog where contest_id=public.study_root(id))) with check(catalog_key is null and not catalog_archived);

create function public.study_catalog_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.study_roles where user_id=auth.uid() and role='admin');
$$;
create function public.study_catalog_metadata(value jsonb) returns void language plpgsql immutable set search_path='' as $$
declare source jsonb; key text;
begin
  foreach key in array array['archived','listed'] loop
    if value ? key and jsonb_typeof(value->key)<>'boolean' then raise exception 'Indicador inválido: %',key; end if;
  end loop;
  if value ? 'sources' then
    if jsonb_typeof(value->'sources')<>'array' or jsonb_array_length(value->'sources')>30 then raise exception 'Lista de referências inválida'; end if;
    for source in select * from jsonb_array_elements(value->'sources') loop
      if jsonb_typeof(source)<>'object' or source - array['title','url'] <> '{}'::jsonb or coalesce(length(trim(source->>'title')),0) not between 1 and 180 or coalesce(source->>'url','') !~ '^https://[^/@[:space:]]+([/:?].*)?$' then raise exception 'Referência de origem inválida'; end if;
    end loop;
  end if;
  if value ? 'checklist' then
    if jsonb_typeof(value->'checklist')<>'array' or jsonb_array_length(value->'checklist')>5 or exists(select 1 from jsonb_array_elements(value->'checklist') x where x::text !~ '^[0-4]$') or (select count(distinct x) from jsonb_array_elements(value->'checklist') x)<>jsonb_array_length(value->'checklist') then raise exception 'Checklist inválido'; end if;
  end if;
  if value ? 'priority' and coalesce(value->>'priority','') not in ('low','medium','high') then raise exception 'Prioridade inválida'; end if;
  foreach key in array array['questions','weight','minutes'] loop
    if value ? key and (jsonb_typeof(value->key)<>'number' or (value->>key)::numeric not between (case when key='minutes' then 1 else 0 end) and 100000 or (key<>'weight' and (value->>key)::numeric<>trunc((value->>key)::numeric))) then raise exception 'Valor inválido: %',key; end if;
  end loop;
end; $$;
revoke all on function public.study_catalog_metadata(jsonb) from public,anon,authenticated;
create function public.study_catalog_document(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; root public.study_nodes;
begin
  if not public.study_catalog_admin() or not public.study_edit(target) then raise exception 'Sem permissão para editar o concurso'; end if;
  select * into strict root from public.study_nodes where id=target and kind='contest';
  select document into result from public.study_catalog where contest_id=target;
  if result is not null then return result; end if;
  return jsonb_build_object('schema_version','1.0','type','contest','id','local-'||target,'name',root.name,'notice',coalesce((select jsonb_strip_nulls(jsonb_build_object('version',v.version,'url',v.source_url,'published_on',v.published_on)) from public.study_contest_versions v where v.contest_id=target order by v.version desc limit 1),' {"version":1}'::jsonb),'items',
    coalesce((select jsonb_agg(jsonb_build_object('id','node-'||n.id,'parent',case when n.parent_id=target then null else 'node-'||n.parent_id end,'kind',n.kind,'name',n.name) order by n.position,n.id) from public.study_nodes n where n.id<>target and public.study_root(n.id)=target),'[]'::jsonb),'resources','[]'::jsonb)
    || case when root.board='' then '{}'::jsonb else jsonb_build_object('board',root.board) end;
end; $$;

-- A single statement commits the catalogue, relational projection, version and receipt together.
create function public.study_apply_catalog(doc jsonb, expected jsonb, target uuid, request_id uuid, operation text) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare
  root_id uuid; root_owner uuid; current_doc jsonb; entry jsonb; old_entry jsonb;
  parent_node uuid; item_id uuid; material_id uuid; bibliography_id uuid; version_id uuid;
  item_map jsonb:='{}'; ordering bigint; section text; kind text; version_number integer;
begin
  if not public.study_catalog_admin() then raise exception 'Apenas administradores podem gravar o catálogo'; end if;
  if doc is null or octet_length(doc::text)>1048576 or doc->>'schema_version' is distinct from '1.0' or doc->>'type' is distinct from 'contest'
    or coalesce(doc->>'id','') !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or coalesce(length(trim(doc->>'name')),0) not between 1 and 180
    or jsonb_typeof(doc->'items') is distinct from 'array' or jsonb_typeof(doc->'resources') is distinct from 'array'
    or operation is null or operation not in ('import','manual','duplicate') or request_id is null then raise exception 'Documento inválido'; end if;
  if jsonb_array_length(doc->'items')>1500 or jsonb_array_length(doc->'resources')>2000 then raise exception 'Documento excede o limite de itens'; end if;
  if doc - array['schema_version','type','id','name','organization','role','board','exam_date','listed','archived','questions','weight','sources','notice','items','resources'] <> '{}'::jsonb
    or jsonb_typeof(doc->'notice') is distinct from 'object' or (doc->'notice') - array['version','url','published_on'] <> '{}'::jsonb then raise exception 'Campos do concurso ou edital inválidos'; end if;
  perform (doc->>'exam_date')::date;
  perform public.study_catalog_metadata(doc);
  perform pg_advisory_xact_lock(hashtextextended(doc->>'id',0));
  select contest_id into root_id from public.study_catalog where external_id=doc->>'id';
  if target is not null and root_id is not null and root_id<>target then raise exception 'ID está vinculado a outro concurso'; end if;
  root_id=coalesce(root_id,target);
  if root_id is not null then
    if not public.study_edit(root_id) then raise exception 'Sem permissão para editar o concurso'; end if;
    select owner_id into strict root_owner from public.study_nodes where id=root_id and study_nodes.kind='contest' for update;
    current_doc=public.study_catalog_document(root_id);
    if current_doc->>'id'<>doc->>'id' then raise exception 'O ID do concurso não pode mudar'; end if;
    if current_doc=doc and exists(select 1 from public.study_catalog where contest_id=root_id) then return root_id; end if;
  end if;
  if current_doc is distinct from expected then raise exception 'A prévia está desatualizada. Abra novamente antes de confirmar'; end if;
  if exists(select 1 from public.study_imports where user_id=auth.uid() and idempotency_key=request_id) then raise exception 'Identificador de operação já utilizado'; end if;
  version_number=(doc#>>'{notice,version}')::integer;
  if version_number is null or version_number not between 1 and 100000 or version_number<coalesce((current_doc#>>'{notice,version}')::integer,1) then raise exception 'Versão de edital inválida'; end if;
  if exists(select 1 from jsonb_array_elements(current_doc->'items') o where not exists(select 1 from jsonb_array_elements(doc->'items') n where n->>'id'=o->>'id' and n->'parent'=o->'parent' and n->'kind'=o->'kind'))
    or exists(select 1 from jsonb_array_elements(current_doc->'resources') o where not exists(select 1 from jsonb_array_elements(doc->'resources') n where n->>'id'=o->>'id' and n->'item'=o->'item' and n->'kind'=o->'kind')) then raise exception 'Preserve os IDs e vínculos existentes. Use archived para retirar itens'; end if;
  if root_id is null then
    root_owner=auth.uid();
    insert into public.study_nodes(kind,name,board,owner_id,catalog_key,catalog_archived) values('contest',doc->>'name',coalesce(doc->>'board',''),root_owner,doc->>'id',coalesce((doc->>'archived')::boolean,false)) returning id into root_id;
  else
    update public.study_nodes set name=doc->>'name',board=coalesce(doc->>'board',''),catalog_key=doc->>'id',catalog_archived=coalesce((doc->>'archived')::boolean,false) where id=root_id;
  end if;
  insert into public.study_catalog values(root_id,doc->>'id',doc,now()) on conflict(contest_id) do update set document=excluded.document,updated_at=excluded.updated_at;
  insert into public.study_contest_versions(contest_id,version,source_url,published_on,status,catalog_snapshot)
    values(root_id,version_number,doc#>>'{notice,url}',(doc#>>'{notice,published_on}')::date,'published',doc)
    on conflict(contest_id,version) do update set source_url=excluded.source_url,published_on=excluded.published_on,status='published',catalog_snapshot=excluded.catalog_snapshot returning id into version_id;
  update public.study_contest_versions set status='superseded' where contest_id=root_id and version<version_number and status='published';
  for entry,ordering in select value,ordinality from jsonb_array_elements(doc->'items') with ordinality order by case value->>'kind' when 'discipline' then 0 when 'topic' then 1 else 2 end,ordinality loop
    if coalesce(entry->>'id','') !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or item_map ? (entry->>'id') or entry - array['id','parent','kind','name','archived','questions','weight','priority','minutes','checklist','sources'] <> '{}'::jsonb then raise exception 'Item inválido ou duplicado'; end if;
    perform public.study_catalog_metadata(entry);
    if entry->>'kind'='discipline' and entry->'parent'='null'::jsonb then parent_node=root_id;
    else parent_node=(item_map->>(entry->>'parent'))::uuid; end if;
    if parent_node is null then raise exception 'Pai inválido para %',entry->>'id'; end if;
    select value into old_entry from jsonb_array_elements(current_doc->'items') where value->>'id'=entry->>'id';
    select n.id into item_id from public.study_nodes n where n.catalog_key=entry->>'id' and n.parent_id=parent_node;
    if item_id is null and old_entry is not null and entry->>'id' ~ '^node-[a-f0-9-]{36}$' then
      select n.id into item_id from public.study_nodes n where n.id=substring(entry->>'id' from 6)::uuid and n.parent_id=parent_node;
    end if;
    if item_id is null then
      insert into public.study_nodes(parent_id,kind,name,owner_id,position,catalog_key,catalog_archived) values(parent_node,entry->>'kind',entry->>'name',root_owner,ordering,entry->>'id',coalesce((entry->>'archived')::boolean,false)) returning id into item_id;
    else
      update public.study_nodes set name=entry->>'name',position=ordering,catalog_key=entry->>'id',catalog_archived=coalesce((entry->>'archived')::boolean,false) where id=item_id;
    end if;
    item_map=item_map||jsonb_build_object(entry->>'id',item_id);
    insert into public.study_version_items(version_id,node_id,name,position) values(version_id,item_id,entry->>'name',ordering) on conflict(version_id,node_id) do update set name=excluded.name,position=excluded.position;
  end loop;
  for entry,ordering in select value,ordinality from jsonb_array_elements(doc->'resources') with ordinality loop
    if coalesce(entry->>'id','') !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or (select count(*) from jsonb_array_elements(doc->'resources') x where x->>'id'=entry->>'id')>1 or entry - array['id','item','kind','title','author','edition','url','text','archived','sources'] <> '{}'::jsonb then raise exception 'Recurso inválido ou duplicado'; end if;
    perform public.study_catalog_metadata(entry);
    item_id=(item_map->>(entry->>'item'))::uuid;
    if item_id is null then raise exception 'Recurso sem assunto válido'; end if;
    section=case entry->>'kind' when 'bibliography' then 'Bibliografia' when 'video' then 'Videoaulas' when 'legislation' then 'Legislação' when 'material' then 'Teoria e resumos' when 'external_questions' then 'Questões externas' end;
    kind=case when entry->>'kind'='video' then 'youtube' when entry ? 'url' then 'link' else 'text' end;
    if section is null or (entry->>'kind' in ('video','legislation','external_questions') and not entry ? 'url') or (section='Bibliografia' and coalesce(length(trim(entry->>'author')),0)=0) then raise exception 'Recurso inválido'; end if;
    select r.material_id,r.bibliography_id into material_id,bibliography_id from public.study_catalog_resources r where r.contest_id=root_id and r.external_id=entry->>'id';
    material_id=coalesce(material_id,gen_random_uuid());
    insert into public.study_materials(id,topic_id,owner_id,section,title,kind,url,body,position,catalog_managed,catalog_archived)
      values(material_id,item_id,root_owner,section,entry->>'title',kind,coalesce(entry->>'url',''),concat_ws(E'\n',entry->>'author',entry->>'edition',entry->>'text',case when section='Bibliografia' and not entry ? 'url' then entry->>'title' end),ordering,true,coalesce((entry->>'archived')::boolean,false))
      on conflict(id) do update set title=excluded.title,kind=excluded.kind,url=excluded.url,body=excluded.body,position=excluded.position,catalog_archived=excluded.catalog_archived,verified=false;
    if section='Bibliografia' then
      bibliography_id=coalesce(bibliography_id,gen_random_uuid());
      insert into public.study_bibliographies(id,owner_id,topic_id,title,author,edition,url,material_id) values(bibliography_id,root_owner,item_id,entry->>'title',entry->>'author',coalesce(entry->>'edition',''),entry->>'url',material_id)
        on conflict(id) do update set title=excluded.title,author=excluded.author,edition=excluded.edition,url=excluded.url;
    end if;
    insert into public.study_catalog_resources values(root_id,entry->>'id',material_id,bibliography_id) on conflict(contest_id,external_id) do nothing;
  end loop;
  insert into public.study_imports(user_id,kind,contract_version,idempotency_key,status,summary) values(auth.uid(),'contest:'||operation,'1.0',request_id,'applied',jsonb_build_object('contest_id',root_id,'name',doc->>'name','version',version_number,'items',jsonb_array_length(doc->'items'),'resources',jsonb_array_length(doc->'resources')));
  return root_id;
end; $$;

create function public.study_set_equivalence(first_id uuid,second_id uuid,confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.study_catalog_admin() or not ((public.study_edit(first_id) and public.study_read(second_id)) or (public.study_edit(second_id) and public.study_read(first_id))) then raise exception 'Sem permissão para associar assuntos'; end if;
 if public.study_root(first_id)=public.study_root(second_id) or (select count(*) from public.study_nodes where id in (first_id,second_id) and kind in ('topic','subtopic'))<>2 then raise exception 'Selecione assuntos de concursos distintos'; end if;
 if confirmed then insert into public.study_topic_equivalences values(least(first_id,second_id),greatest(first_id,second_id),auth.uid(),now()) on conflict do nothing;
 else delete from public.study_topic_equivalences where first_topic=least(first_id,second_id) and second_topic=greatest(first_id,second_id); end if;
end; $$;
revoke all on function public.study_catalog_admin(),public.study_catalog_document(uuid),public.study_apply_catalog(jsonb,jsonb,uuid,uuid,text),public.study_set_equivalence(uuid,uuid,boolean) from public,anon;
grant execute on function public.study_catalog_admin(),public.study_catalog_document(uuid),public.study_apply_catalog(jsonb,jsonb,uuid,uuid,text),public.study_set_equivalence(uuid,uuid,boolean) to authenticated;
