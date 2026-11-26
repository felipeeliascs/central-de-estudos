-- Apply to a Supabase project after review. No remote environment is assumed.
create table public.study_nodes (
 id uuid primary key default gen_random_uuid(),
 parent_id uuid references public.study_nodes(id) on delete restrict,
 kind text not null check(kind in ('contest','discipline','topic','subtopic')),
 name text not null check(length(trim(name)) between 1 and 180),
 board text not null default '', owner_id uuid not null references auth.users(id),
 position integer not null default 0 check(position>=0)
);
create table public.study_members (
 contest_id uuid not null references public.study_nodes(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 role text not null default 'reader' check(role in ('reader','editor')),
 primary key(contest_id,user_id)
);
create function public.study_root(node_id uuid) returns uuid language sql stable security definer set search_path='' as $$
 with recursive path as (select id,parent_id from public.study_nodes where id=node_id union all select n.id,n.parent_id from public.study_nodes n join path p on n.id=p.parent_id) select id from path where parent_id is null;
$$;
create function public.study_read(node_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.study_nodes n where n.id=public.study_root(node_id) and (n.owner_id=auth.uid() or exists(select 1 from public.study_members m where m.contest_id=n.id and m.user_id=auth.uid())));
$$;
create function public.study_edit(node_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.study_nodes n where n.id=public.study_root(node_id) and (n.owner_id=auth.uid() or exists(select 1 from public.study_members m where m.contest_id=n.id and m.user_id=auth.uid() and m.role='editor')));
$$;
create function public.study_node_guard() returns trigger language plpgsql set search_path='' as $$
declare p public.study_nodes;
begin
 if TG_OP='UPDATE' and (new.id<>old.id or new.owner_id<>old.owner_id or new.parent_id is distinct from old.parent_id or new.kind<>old.kind) then raise exception 'A identidade e a posição hierárquica são imutáveis'; end if;
 if new.kind='contest' then
   if new.parent_id is not null or (TG_OP='INSERT' and new.owner_id<>auth.uid()) then raise exception 'Concurso inválido'; end if;
 else
   select * into p from public.study_nodes where id=new.parent_id;
   if p.id is null or p.owner_id<>new.owner_id or not ((new.kind='discipline' and p.kind='contest') or (new.kind='topic' and p.kind='discipline') or (new.kind='subtopic' and p.kind='topic')) then raise exception 'Hierarquia inválida'; end if;
 end if;
 return new;
end; $$;
create trigger study_node_guard before insert or update on public.study_nodes for each row execute function public.study_node_guard();
create table public.study_materials (
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.study_nodes(id) on delete restrict,
 owner_id uuid not null references auth.users(id),
 section text not null check(section in ('Videoaulas','Teoria e resumos','Bibliografia','Legislação','Mapas mentais','Questões externas','Flashcards')),
 title text not null check(length(trim(title)) between 1 and 180),
 kind text not null check(kind in ('youtube','link','text','pdf','image')),
 url text not null default '' check(url='' or url ~ '^https://[^/@[:space:]]+([/:?].*)?$'),
 body text not null default '' check(length(body)<=100000), back text not null default '' check(length(back)<=100000),
 file_path text not null default '', visibility text not null default 'private' check(visibility in ('private','shared')),
 shared_with uuid[] not null default '{}', position integer not null default 0 check(position>=0),
 embed boolean not null default true, verified boolean not null default false,
 check(visibility='private' or cardinality(shared_with)>0),
 check(kind not in ('link','youtube') or url<>''),
 check(kind<>'text' or length(trim(body))>0),
 check(section<>'Flashcards' or (length(trim(body))>0 and length(trim(back))>0)),
 check(kind not in ('pdf','image') or file_path<>''),
 check(file_path='' or file_path like owner_id::text || '/' || id::text || '/%')
);
create function public.study_material_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.id<>old.id or new.owner_id<>old.owner_id or new.topic_id<>old.topic_id) then raise exception 'Identidade imutável'; end if;
 if not exists(select 1 from public.study_nodes where id=new.topic_id and kind in ('topic','subtopic')) then raise exception 'Selecione assunto ou subassunto'; end if;
 return new;
end; $$;
create trigger study_material_guard before insert or update on public.study_materials for each row execute function public.study_material_guard();
create table public.study_checks (
 user_id uuid not null references auth.users(id), topic_id uuid not null references public.study_nodes(id) on delete restrict,
 step integer not null check(step between 0 and 4), done boolean not null default false,
 primary key(user_id,topic_id,step)
);
create table public.study_notes (
 user_id uuid not null references auth.users(id), topic_id uuid not null references public.study_nodes(id) on delete restrict,
 body text not null default '' check(length(body)<=100000), primary key(user_id,topic_id)
);
alter table public.study_nodes enable row level security;
alter table public.study_members enable row level security;
alter table public.study_materials enable row level security;
alter table public.study_checks enable row level security;
alter table public.study_notes enable row level security;
create policy node_read on public.study_nodes for select to authenticated using(public.study_read(id));
create policy node_insert on public.study_nodes for insert to authenticated with check((kind='contest' and owner_id=auth.uid()) or (kind<>'contest' and public.study_edit(parent_id)));
create policy node_update on public.study_nodes for update to authenticated using(public.study_edit(id)) with check(public.study_edit(id));
-- No hierarchy deletion: retain identities and all users' study history.
create policy member_read on public.study_members for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.study_nodes n where n.id=contest_id and n.owner_id=auth.uid()));
create policy member_manage on public.study_members for all to authenticated using(exists(select 1 from public.study_nodes n where n.id=contest_id and n.kind='contest' and n.owner_id=auth.uid())) with check(exists(select 1 from public.study_nodes n where n.id=contest_id and n.kind='contest' and n.owner_id=auth.uid()));
create policy material_read on public.study_materials for select to authenticated using(public.study_read(topic_id) and (owner_id=auth.uid() or (visibility='shared' and auth.uid()=any(shared_with))));
create policy material_insert on public.study_materials for insert to authenticated with check(owner_id=auth.uid() and public.study_read(topic_id));
create policy material_update on public.study_materials for update to authenticated using(owner_id=auth.uid() and public.study_read(topic_id)) with check(owner_id=auth.uid() and public.study_read(topic_id));
create policy material_delete on public.study_materials for delete to authenticated using(owner_id=auth.uid() and public.study_read(topic_id));
create policy check_private on public.study_checks for all to authenticated using(user_id=auth.uid() and public.study_read(topic_id)) with check(user_id=auth.uid() and public.study_read(topic_id) and exists(select 1 from public.study_nodes n where n.id=topic_id and n.kind in ('topic','subtopic')));
create policy note_private on public.study_notes for all to authenticated using(user_id=auth.uid() and public.study_read(topic_id)) with check(user_id=auth.uid() and public.study_read(topic_id) and exists(select 1 from public.study_nodes n where n.id=topic_id and n.kind in ('topic','subtopic')));
create index study_nodes_parent on public.study_nodes(parent_id);
create index study_members_user on public.study_members(user_id);
create index study_materials_topic on public.study_materials(topic_id,section,position);
grant select,insert,update,delete on public.study_nodes,public.study_members,public.study_materials,public.study_checks,public.study_notes to authenticated;
revoke all on function public.study_root(uuid),public.study_read(uuid),public.study_edit(uuid) from public;
grant execute on function public.study_root(uuid),public.study_read(uuid),public.study_edit(uuid) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('study-materials','study-materials',false,20971520,array['application/pdf','image/png','image/jpeg','image/webp']);
create policy study_file_read on storage.objects for select to authenticated using(bucket_id='study-materials' and exists(select 1 from public.study_materials m where m.file_path=name));
create policy study_file_insert on storage.objects for insert to authenticated with check(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.study_materials m where m.file_path=name and m.owner_id=auth.uid()));
create policy study_file_delete on storage.objects for delete to authenticated using(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
-- No UPDATE policy: files use immutable, unique paths, never overwrite an object.
create function public.study_move_material(material_id uuid,direction integer) returns void language plpgsql security invoker set search_path='' as $$
declare m public.study_materials; ids uuid[]; idx integer; other uuid;
begin
 if direction not in (-1,1) then raise exception 'Direção inválida'; end if;
 select * into m from public.study_materials where id=material_id and owner_id=auth.uid();
 if m.id is null then raise exception 'Sem permissão'; end if;
 perform id from public.study_materials where topic_id=m.topic_id and section=m.section and owner_id=auth.uid() order by id for update;
 select array_agg(id order by position,id) into ids from public.study_materials where topic_id=m.topic_id and section=m.section and owner_id=auth.uid();
 idx=array_position(ids,material_id); other=ids[idx+direction]; if other is null then return; end if;
 update public.study_materials set position=array_position(ids,id) where id=any(ids);
 update public.study_materials set position=case when id=material_id then idx+direction else idx end where id in (material_id,other);
end; $$;
revoke all on function public.study_move_material(uuid,integer) from public;
grant execute on function public.study_move_material(uuid,integer) to authenticated;
