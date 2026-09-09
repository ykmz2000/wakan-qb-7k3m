alter table public.question_images add column if not exists original_image_path text;
alter table public.user_note_images add column if not exists original_image_path text;
comment on column public.question_images.original_image_path is 'Original storage object retained before the first image edit. Annotation objects are not persisted.';
comment on column public.user_note_images.original_image_path is 'Original private storage object retained before the first image edit. Annotation objects are not persisted.';
