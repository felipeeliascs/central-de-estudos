create table public.prompt_templates (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 180),
 description text not null check(length(trim(description)) between 1 and 1000),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.prompt_template_versions (
 template_id uuid not null references public.prompt_templates(id),
 revision integer not null check(revision>0),
 body text not null check(length(trim(body)) between 1 and 30000),
 steps text not null check(length(trim(steps)) between 1 and 3000),
 example text not null check(length(trim(example)) between 1 and 3000),
 target text not null check(target in ('none','contest','questions','cards')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 primary key(template_id,revision)
);
alter table public.prompt_templates enable row level security;
alter table public.prompt_template_versions enable row level security;
revoke all on public.prompt_templates,public.prompt_template_versions from public,anon,authenticated;
grant select on public.prompt_templates,public.prompt_template_versions to authenticated;
create policy prompt_templates_read on public.prompt_templates for select to authenticated using(true);
create policy prompt_template_versions_read on public.prompt_template_versions for select to authenticated using(true);
create function public.prompt_publish(template_ref uuid,title_value text,description_value text,body_value text,steps_value text,example_value text,target_value text) returns uuid
language plpgsql security definer set search_path='' as $$
declare next_revision integer;
begin
 if not public.study_catalog_admin() then raise exception 'Apenas administradores podem publicar prompts'; end if;
 if template_ref is null then template_ref=gen_random_uuid();end if;
 perform pg_advisory_xact_lock(hashtextextended(template_ref::text,0));
 insert into public.prompt_templates(id,title,description,created_by) values(template_ref,title_value,description_value,auth.uid())
 on conflict(id) do update set title=excluded.title,description=excluded.description;
 select coalesce(max(revision),0)+1 into next_revision from public.prompt_template_versions where template_id=template_ref;
 insert into public.prompt_template_versions(template_id,revision,body,steps,example,target,created_by) values(template_ref,next_revision,body_value,steps_value,example_value,target_value,auth.uid());
 return template_ref;
end; $$;
revoke all on function public.prompt_publish(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.prompt_publish(uuid,text,text,text,text,text,text) to authenticated;
