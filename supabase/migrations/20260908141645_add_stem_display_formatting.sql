-- Additive display metadata only; existing question, answer, image, note and history content is not rewritten.
set lock_timeout = '5s';
alter table public.questions
  add column if not exists stem_formatting jsonb
  check (stem_formatting is null or jsonb_typeof(stem_formatting) = 'object');
comment on column public.questions.stem_formatting is
  'Optional administrator-applied DISPLAY formatting only, separate from canonical plain stem, explanation_formatting, and source/occurrence originals. {version:1,origin:admin_display,source_text:exact matching stem,ranges:[{start,end,kind}]}. UTF-16 offsets; kinds bold/underline/strike/marker/accent. Ignore when source_text differs. This is not evidence of original PDF emphasis; never update exact_stem, official_answer, or source documents when formatting. Existing questions table RLS governs reads and edits.';
