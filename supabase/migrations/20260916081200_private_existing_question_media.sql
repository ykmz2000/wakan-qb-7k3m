-- Existing official question media becomes login-only without moving or
-- re-encoding objects. Keep the legacy bucket usable for its remaining rows.
update storage.buckets
set public = false
where id in ('question-media', 'question-images');

drop policy if exists question_images_public_read on storage.objects;
drop policy if exists question_images_authenticated_read on storage.objects;
create policy question_images_authenticated_read
on storage.objects for select
to authenticated
using (bucket_id = 'question-images');

-- The storage_bucket column was introduced after these legacy rows. Correct
-- only unambiguous rows; paths that also exist in question-media keep the
-- current question-media association and therefore preserve prior behavior.
update public.question_images qi
set storage_bucket = 'question-images'
where qi.storage_bucket = 'question-media'
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'question-images' and o.name = qi.image_path
  )
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'question-media' and o.name = qi.image_path
  );

comment on column public.question_images.storage_bucket is
  'Storage bucket containing image_path. Official media buckets are private and resolved with authenticated downloads or signed URLs.';
