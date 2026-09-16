insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'question-media-private',
  'question-media-private',
  false,
  104857600,
  array['image/png','image/jpeg','image/webp','image/heic','image/heif','image/gif','application/pdf']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

alter table public.question_images
  add column if not exists storage_bucket text not null default 'question-media';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.question_images'::regclass
      and conname='question_images_storage_bucket_check'
  ) then
    alter table public.question_images
      add constraint question_images_storage_bucket_check
      check (storage_bucket in ('question-media','question-media-private','question-images'));
  end if;
end $$;

drop policy if exists "authenticated read private question media" on storage.objects;
create policy "authenticated read private question media"
on storage.objects for select
to authenticated
using (
  bucket_id='question-media-private'
  and (
    is_admin()
    or exists (
      select 1
      from public.question_images qi
      join public.questions q on q.id=qi.question_id
      where qi.storage_bucket='question-media-private'
        and qi.image_path=storage.objects.name
        and q.status='published'::public.question_status
    )
  )
);

drop policy if exists "admin insert private question media" on storage.objects;
create policy "admin insert private question media"
on storage.objects for insert
to authenticated
with check (bucket_id='question-media-private' and is_admin());

drop policy if exists "admin update private question media" on storage.objects;
create policy "admin update private question media"
on storage.objects for update
to authenticated
using (bucket_id='question-media-private' and is_admin())
with check (bucket_id='question-media-private' and is_admin());

drop policy if exists "admin delete private question media" on storage.objects;
create policy "admin delete private question media"
on storage.objects for delete
to authenticated
using (bucket_id='question-media-private' and is_admin());

comment on column public.question_images.storage_bucket is
'Storage bucket for this row. New question-stem images use private authenticated media; legacy rows retain their existing bucket.';
