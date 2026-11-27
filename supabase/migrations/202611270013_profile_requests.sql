-- Apply after 001–012, first in a disposable/homologation project.
alter table public.study_profiles
  add column username text not null default '' check(username='' or username ~ '^[a-z0-9._-]{3,40}$'),
  add column phone text not null default '' check(length(phone)<=30),
  add column bio text not null default '' check(length(bio)<=1000),
  add column avatar_path text not null default '' check(avatar_path='' or avatar_path ~ ('^'||user_id::text||'/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$'));
grant update(username,phone,bio,avatar_path) on public.study_profiles to authenticated;
-- Existing profile_self/profile_update policies continue to restrict access to auth.uid().
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-photos','profile-photos',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy profile_photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_photo_insert on storage.objects for insert to authenticated with check(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_photo_delete on storage.objects for delete to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create table public.study_account_deletion_requests (
  user_id uuid primary key references auth.users(id),
  reason text not null default '' check(length(reason)<=1000),
  status text not null default 'pending' check(status in ('pending','cancelled','completed')),
  requested_at timestamptz not null default now()
);
alter table public.study_account_deletion_requests enable row level security;
revoke all on public.study_account_deletion_requests from public,anon,authenticated;
-- Only RPCs access requests. No client may delete accounts or mark a request completed.
create function public.study_my_deletion_request() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
  return (select jsonb_build_object('status',r.status,'requested_at',r.requested_at) from public.study_account_deletion_requests r where user_id=auth.uid());
end; $$;
create function public.study_request_account_deletion(request_reason text default '') returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
  if request_reason is null or length(request_reason)>1000 then raise exception 'Motivo inválido'; end if;
  insert into public.study_account_deletion_requests(user_id,reason) values(auth.uid(),trim(request_reason))
  on conflict(user_id) do update set reason=excluded.reason,status='pending',requested_at=now()
  where study_account_deletion_requests.status<>'completed';
end; $$;
create function public.study_cancel_account_deletion() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
  update public.study_account_deletion_requests set status='cancelled' where user_id=auth.uid() and status='pending';
end; $$;
create function public.study_admin_deletion_requests() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.study_catalog_admin() then raise exception 'Apenas administradores'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'display_name',p.display_name,'email',u.email,'reason',r.reason,'requested_at',r.requested_at) order by r.requested_at)
    from public.study_account_deletion_requests r join public.study_profiles p on p.user_id=r.user_id join auth.users u on u.id=r.user_id where r.status='pending'),'[]'::jsonb);
end; $$;
revoke all on function public.study_my_deletion_request(),public.study_request_account_deletion(text),public.study_cancel_account_deletion(),public.study_admin_deletion_requests() from public,anon;
grant execute on function public.study_my_deletion_request(),public.study_request_account_deletion(text),public.study_cancel_account_deletion(),public.study_admin_deletion_requests() to authenticated;
