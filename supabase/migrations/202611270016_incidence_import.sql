-- Apply after 001–015 in the authorized test environment first.
create function public.study_incidence_import_context(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.study_catalog_admin() or not public.study_edit(target) then raise exception 'Apenas administradores com edição podem importar incidência'; end if;
 if not exists(select 1 from public.study_catalog where contest_id=target) then raise exception 'Selecione um concurso do catálogo'; end if;
 return jsonb_build_object(
  'doc',public.study_catalog_document(target),
  'itemMap',coalesce((select jsonb_object_agg(n.catalog_key,n.id) from public.study_nodes n where public.study_root(n.id)=target and n.kind in ('topic','subtopic') and n.catalog_key is not null),'{}'::jsonb),
  'expected',coalesce((select jsonb_agg(jsonb_build_object('topic_id',h.topic_id,'board',h.board,'measure',h.measure,'sample',h.sample,'occurrences',h.occurrences,'source_url',h.source_url,'period_start',h.period_start,'period_end',h.period_end) order by h.topic_id,h.board) from public.study_historical_incidence h where public.study_root(h.topic_id)=target),'[]'::jsonb));
end; $$;
revoke all on function public.study_incidence_import_context(uuid) from public,anon;
grant execute on function public.study_incidence_import_context(uuid) to authenticated;

create function public.study_apply_incidence_batch(target uuid,batch jsonb,expected_document jsonb,expected_incidence jsonb,request_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare ctx jsonb; entry jsonb; item jsonb; parent_item jsonb; item_id uuid; seen text[]:='{}'; field text; group_name text;
 sample_value integer; occurrence_value integer; affected integer; changed integer:=0; first_day date; last_day date; external_key text;
begin
 if not public.study_catalog_admin() or not public.study_edit(target) then raise exception 'Apenas administradores com edição podem importar incidência'; end if;
 if batch is null or jsonb_typeof(batch) is distinct from 'object' or octet_length(batch::text)>524288
  or batch-array['schema_version','type','contest_id','board','measure','period_start','period_end','sample','entries','unavailable']<>'{}'::jsonb
  or jsonb_typeof(batch->'schema_version') is distinct from 'string' or jsonb_typeof(batch->'type') is distinct from 'string' or jsonb_typeof(batch->'contest_id') is distinct from 'string' or jsonb_typeof(batch->'measure') is distinct from 'string'
  or batch->>'schema_version' is distinct from '1.0' or batch->>'type' is distinct from 'incidence_batch'
  or jsonb_typeof(batch->'entries') is distinct from 'array' or jsonb_typeof(batch->'unavailable') is distinct from 'array' or request_id is null then raise exception 'Lote de incidência inválido'; end if;
 if jsonb_array_length(batch->'entries') not between 1 and 1500 or jsonb_array_length(batch->'unavailable')>1500 or jsonb_array_length(batch->'entries')+jsonb_array_length(batch->'unavailable')>1500 then raise exception 'Informe de 1 a 1500 evidências no limite total de 1500 assuntos'; end if;
 select external_id into external_key from public.study_catalog where contest_id=target;
 if external_key is null or batch->>'contest_id' is distinct from external_key then raise exception 'ID externo do concurso diferente do destino'; end if;
 perform pg_advisory_xact_lock(hashtextextended(external_key,0));
 perform id from public.study_nodes where id=target for update;
 lock table public.study_historical_incidence in share row exclusive mode;
 ctx=public.study_incidence_import_context(target);
 if ctx->'doc' is distinct from expected_document or ctx->'expected' is distinct from expected_incidence then raise exception 'A prévia está desatualizada. Gere novamente antes de salvar'; end if;
 if ctx#>>'{doc,archived}'='true' then raise exception 'Reative o concurso antes de importar'; end if;
 if jsonb_typeof(batch->'board') is distinct from 'string' or coalesce(length(trim(batch->>'board')),0) not between 1 and 180 or batch->>'board' is distinct from ctx#>>'{doc,board}' then raise exception 'Use a banca exata do edital'; end if;
 if coalesce(batch->>'measure','') not in ('exams','questions') then raise exception 'Informe a unidade exams ou questions'; end if;
 foreach field in array array['period_start','period_end'] loop
  if jsonb_typeof(batch->field) is distinct from 'string' or (batch->>field)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Use período válido AAAA-MM-DD'; end if;
 end loop;
 first_day=(batch->>'period_start')::date; last_day=(batch->>'period_end')::date;
 if last_day<first_day or first_day<date '0001-01-01' then raise exception 'Período inválido'; end if;
 if jsonb_typeof(batch->'sample') is distinct from 'number' or (batch->>'sample')!~'^[0-9]+$' then raise exception 'Amostra deve ser inteira'; end if;
 sample_value=(batch->>'sample')::integer;
 if sample_value not between 1 and 1000000 then raise exception 'Amostra deve estar entre 1 e 1000000'; end if;
 -- Validate the entire batch, including explicit evidence gaps, before writing.
 foreach group_name in array array['entries','unavailable'] loop
  for entry in select * from jsonb_array_elements(batch->group_name) loop
   if jsonb_typeof(entry) is distinct from 'object' or
    (group_name='entries' and entry-array['item','occurrences','source_url']<>'{}'::jsonb) or
    (group_name='unavailable' and entry-array['item','reason']<>'{}'::jsonb) then raise exception 'Campos da evidência inválidos'; end if;
   if jsonb_typeof(entry->'item') is distinct from 'string' or coalesce(entry->>'item','')!~'^[a-z0-9][a-z0-9._-]{0,79}$' or entry->>'item'=any(seen) then raise exception 'ID de assunto inválido ou duplicado'; end if;
   seen=array_append(seen,entry->>'item');
   select value into item from jsonb_array_elements(ctx#>'{doc,items}') where value->>'id'=entry->>'item';
   item_id=(ctx->'itemMap'->>(entry->>'item'))::uuid;
   if item_id is null or item is null or item->>'kind' not in ('topic','subtopic') then raise exception 'Referência de assunto inválida'; end if;
   parent_item=item;
   loop
    if parent_item->'archived'='true'::jsonb then raise exception 'Assunto ou ancestral arquivado'; end if;
    exit when parent_item->>'parent' is null;
    select value into parent_item from jsonb_array_elements(ctx#>'{doc,items}') where value->>'id'=parent_item->>'parent';
   end loop;
   if group_name='unavailable' then
    if jsonb_typeof(entry->'reason') is distinct from 'string' or coalesce(length(trim(entry->>'reason')),0) not between 1 and 180 then raise exception 'Motivo deve ter de 1 a 180 caracteres'; end if;
   else
    if jsonb_typeof(entry->'occurrences') is distinct from 'number' or (entry->>'occurrences')!~'^[0-9]+$' then raise exception 'Ocorrências devem ser inteiras'; end if;
    occurrence_value=(entry->>'occurrences')::integer;
    if occurrence_value not between 0 and sample_value then raise exception 'Ocorrências não podem exceder a amostra'; end if;
    if jsonb_typeof(entry->'source_url') is distinct from 'string' or length(entry->>'source_url') not between 1 and 2000 or (entry->>'source_url')!~'^https://[^/@[:space:]:?#]+(:[0-9]+)?([/?#][^[:space:]]*)?$' then raise exception 'Use fonte HTTPS sem credenciais, até 2000 caracteres'; end if;
   end if;
  end loop;
 end loop;
 if exists(select 1 from public.study_imports where user_id=auth.uid() and idempotency_key=request_id) then raise exception 'Identificador de operação já utilizado'; end if;
 for entry in select * from jsonb_array_elements(batch->'entries') loop
  item_id=(ctx->'itemMap'->>(entry->>'item'))::uuid;
  insert into public.study_historical_incidence(topic_id,board,measure,sample,occurrences,source_url,period_start,period_end,verified_by)
  values(item_id,batch->>'board',batch->>'measure',sample_value,(entry->>'occurrences')::integer,entry->>'source_url',first_day,last_day,auth.uid())
  on conflict(topic_id,board) do update set measure=excluded.measure,sample=excluded.sample,occurrences=excluded.occurrences,source_url=excluded.source_url,period_start=excluded.period_start,period_end=excluded.period_end,verified_by=excluded.verified_by,verified_at=now()
  where (study_historical_incidence.measure,study_historical_incidence.sample,study_historical_incidence.occurrences,study_historical_incidence.source_url,study_historical_incidence.period_start,study_historical_incidence.period_end)
   is distinct from (excluded.measure,excluded.sample,excluded.occurrences,excluded.source_url,excluded.period_start,excluded.period_end);
  get diagnostics affected=row_count; changed=changed+affected;
 end loop;
 if changed>0 then
  insert into public.study_imports(user_id,kind,contract_version,idempotency_key,status,summary)
  values(auth.uid(),'incidence:import','1.0',request_id,'applied',jsonb_build_object('contest_id',target,'name',ctx#>>'{doc,name}','changed',changed,'measure',batch->>'measure','sample',sample_value));
 end if;
 return changed;
end; $$;
revoke all on function public.study_apply_incidence_batch(uuid,jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.study_apply_incidence_batch(uuid,jsonb,jsonb,jsonb,uuid) to authenticated;
