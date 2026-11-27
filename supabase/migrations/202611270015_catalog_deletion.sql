-- Rehearse after 001–014 in a disposable database. Production requires specific approval.
-- No deletion is performed by applying this migration.
create function public.study_contest_delete_blocked(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with nodes as (
  select id from public.study_nodes where id=target or public.study_root(id)=target
 ), managed as (
  select material_id,bibliography_id from public.study_catalog_resources where contest_id=target
 ), references_to_study as (
  select topic_id from public.study_checks
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
 or exists(select 1 from public.study_trails where contest_id=target)
 or exists(select 1 from public.study_materials where topic_id in (select id from nodes)
   and (not catalog_managed or id not in (select material_id from managed) or file_path<>''))
 or exists(select 1 from public.study_bibliographies where topic_id in (select id from nodes)
   and id not in (select bibliography_id from managed where bibliography_id is not null))
 -- Adaptive plans persist UUID references inside JSON rather than FKs. Be conservative.
 or exists(select 1 from public.study_adaptive_plans p cross join nodes n where strpos(p.state::text,n.id::text)>0);
$$;
revoke all on function public.study_contest_delete_blocked(uuid) from public,anon,authenticated;

create function public.study_contest_deletion_status(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare blocked boolean;
begin
 if not public.study_catalog_admin() or not public.study_edit(target) then raise exception 'Sem permissão administrativa para excluir este concurso'; end if;
 if not exists(select 1 from public.study_catalog c join public.study_nodes n on n.id=c.contest_id where c.contest_id=target and n.kind='contest') then raise exception 'Concurso importado não encontrado'; end if;
 blocked=public.study_contest_delete_blocked(target);
 return jsonb_build_object('can_delete',not blocked,'reason',case when blocked then 'Existem dados de estudo ou vínculos associados. Arquive o concurso para preservar esses dados.' else 'Sem dados de estudo vinculados. A exclusão remove o edital, recursos importados e seleções das contas, preservando o histórico de operações.' end);
end; $$;
revoke all on function public.study_contest_deletion_status(uuid) from public,anon;
grant execute on function public.study_contest_deletion_status(uuid) to authenticated;

create function public.study_delete_contest(target uuid, expected jsonb, confirmed_external_id text) returns void
language plpgsql security definer set search_path='' as $$
declare current_doc jsonb; external_key text; node_ids uuid[]; material_ids uuid[]; bibliography_ids uuid[]; level text;
begin
 if not public.study_catalog_admin() or not public.study_edit(target) then raise exception 'Sem permissão administrativa para excluir este concurso'; end if;
 select external_id into external_key from public.study_catalog where contest_id=target;
 if external_key is null then raise exception 'Concurso importado não encontrado'; end if;
 if confirmed_external_id is distinct from external_key then raise exception 'Confirme digitando o ID externo exato do concurso'; end if;
 -- Same lock/order as imports; concurrent imports cannot recreate a stale preview.
 perform pg_advisory_xact_lock(hashtextextended(external_key,0));
 perform id from public.study_nodes where id=target for update;
 current_doc=public.study_catalog_document(target);
 if current_doc is distinct from expected then raise exception 'A prévia está desatualizada. Abra novamente antes de excluir'; end if;
 select array_agg(id) into node_ids from public.study_nodes where id=target or public.study_root(id)=target;
 -- FK writers take key-share locks on these nodes. Lock before rechecking all accounts.
 perform id from public.study_nodes where id=any(node_ids) order by id for update;
 lock table public.study_adaptive_plans in share mode;
 if public.study_contest_delete_blocked(target) then raise exception 'Existem dados de estudo ou vínculos associados. Arquive o concurso para preservar esses dados.'; end if;
 select array_agg(material_id),array_agg(bibliography_id) into material_ids,bibliography_ids from public.study_catalog_resources where contest_id=target;
 delete from public.study_catalog_resources where contest_id=target;
 delete from public.study_bibliographies where id=any(bibliography_ids);
 delete from public.study_materials where id=any(material_ids);
 delete from public.study_version_items where version_id in (select id from public.study_contest_versions where contest_id=target);
 delete from public.study_contest_versions where contest_id=target;
 delete from public.study_catalog where contest_id=target;
 -- These are selections/access metadata only. No study records are cascaded.
 delete from public.study_enrollments where contest_id=target;
 delete from public.study_members where contest_id=target;
 foreach level in array array['subtopic','topic','discipline','contest'] loop
  delete from public.study_nodes where id=any(node_ids) and kind=level;
 end loop;
 insert into public.study_imports(user_id,kind,contract_version,idempotency_key,status,summary)
 values(auth.uid(),'contest:delete','1.0',gen_random_uuid(),'applied',jsonb_build_object('contest_id',target,'external_id',external_key,'name',current_doc->>'name','version',(current_doc#>>'{notice,version}')::integer,'items',jsonb_array_length(current_doc->'items'),'resources',jsonb_array_length(current_doc->'resources')));
 exception when foreign_key_violation then
  -- The whole function body is rolled back, including deleted projections and selections.
  raise exception 'Existem dados de estudo ou vínculos associados. Arquive o concurso para preservar esses dados.';
end; $$;
revoke all on function public.study_delete_contest(uuid,jsonb,text) from public,anon;
grant execute on function public.study_delete_contest(uuid,jsonb,text) to authenticated;
-- Keep direct DELETE on nodes revoked. Only the guarded RPC may remove a catalog.
