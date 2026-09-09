# Annotation image versions and rectangle interaction

- Rectangle hit testing uses the four border segments and stroke-aware pointer tolerance. Its interior stays available for drawing. Existing corner resize handles and lasso enclosure selection remain available.
- Annotation saves retain a reference to the image before the first write since the latest crop. Repeated writes preserve that reference without uploading another copy. Crops and restores clear it.
- `annotation_result_image_path` binds the baseline to the exact current image. A cached client which changes only `image_path` invalidates the binding, so obsolete pre-crop images cannot appear.
- The recent public image picker expands verified rows into current and before-annotation variants, independently selectable, with path deduplication and unchanged database pagination/scoping. Private note images remain private and are not added to the public picker.
- Historical `original_image_path` mixes crop and annotation origins and is never inferred/backfilled. Existing ambiguous originals remain available through the existing restore action, not through recent-image variants.

## Remote schema migration

Supabase project `qebvqcubtyfgaakrzbzh`, applied migration `20260909224318_track_pre_annotation_images`. The migration is recorded in remote migration history; the statement snapshot below supports review/reproduction. CLI was unavailable in this workspace, so no fabricated local migration filename was created.

```sql
alter table public.question_images add column annotation_base_image_path text, add column annotation_result_image_path text;
alter table public.user_note_images add column annotation_base_image_path text, add column annotation_result_image_path text;
comment on column public.question_images.annotation_base_image_path is 'Image before annotation; valid only when annotation_result_image_path equals current image_path. Never infer from original_image_path.';
comment on column public.question_images.annotation_result_image_path is 'Exact annotation result bound to annotation_base_image_path; invalidates provenance after cached-client crops.';
comment on column public.user_note_images.annotation_base_image_path is 'Private image before annotation; valid only when annotation_result_image_path equals current image_path.';
comment on column public.user_note_images.annotation_result_image_path is 'Exact annotation result bound to annotation_base_image_path.';
```

Verified all four columns are nullable text; RLS remains enabled on both existing tables, and no rows were backfilled. Existing function/advisor warnings remain outside this change: [function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous function execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated function execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No new functions, grants, policies or storage objects were introduced by the migration.

## Verification

- Unit: all four rectangle borders, empty interior, bounded stroke tolerance, unaffected image selection.
- Chromium and WebKit: moving the border, marker ink inside an already selected rectangle, saved PNG pixels; real write action and provenance, repeated annotation, crop/reset/cached-client invalidation; picker preview and independent version selection; exclusion of unknown and pre-crop originals.
- Existing Pages deployment gate runs these with editing, image, learning and PDF regressions before publication.

